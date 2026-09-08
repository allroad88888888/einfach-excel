//! 结构历史的失败原子性、惰性恢复及重复回放资源约束。
use einfach_core::{Value, ValueError};
use einfach_excel_core::shift::ShiftEdit;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, Workbook};
use std::cell::Cell;
use std::collections::HashMap;
use std::rc::Rc;

fn inserted() -> (Workbook, WorkbookHistory) {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A2", Value::Number(7.0));
    let mut history = WorkbookHistory::default();
    history
        .edit_structure(&mut wb, 0, ShiftEdit::RowInsert { at: 1, count: 1 })
        .unwrap();
    (wb, history)
}

#[test]
fn failure_zero_count_and_pending_edit_do_not_consume_redo() {
    let (mut wb, mut history) = inserted();
    history.undo(&mut wb).unwrap();
    assert!(history
        .edit_structure(
            &mut wb,
            0,
            ShiftEdit::RowDelete {
                at: 1,
                count: u32::MAX
            }
        )
        .is_err());
    assert!(!history
        .edit_structure(&mut wb, 0, ShiftEdit::RowInsert { at: 1, count: 0 })
        .unwrap());
    let addr = CellAddress::new(0, 0);
    history
        .begin(&wb, 0, CellRange::new(addr, addr), "Edit cell", true)
        .unwrap();
    assert!(history
        .edit_structure(&mut wb, 0, ShiftEdit::RowInsert { at: 1, count: 1 })
        .is_err());
    history.finish(&mut wb, true).unwrap();
    assert_eq!(history.redo_count(), 1);
    history.redo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A3"), Value::Number(7.0));
}

#[test]
fn foreign_workbook_and_replaced_sheet_are_rejected_before_restoring_anything() {
    let (mut wb, mut history) = inserted();
    let mut foreign = Workbook::new();
    foreign.set_cell(0, "A3", Value::Number(88.0));
    assert!(history.undo(&mut foreign).is_err());
    assert_eq!(foreign.get_cell("Sheet1", "A3"), Value::Number(88.0));
    wb.add_sheet("Other");
    wb.remove_sheet(0).unwrap();
    wb.add_sheet("Sheet1");
    assert!(history.undo(&mut wb).is_err());
    assert_eq!(history.undo_count(), 1);
}

#[test]
fn deleted_invalid_parked_sources_restore_without_a_partial_failure() {
    let mut wb = Workbook::new();
    wb.install_sheet_bulk(
        0,
        HashMap::from([(CellAddress::new(1, 0), Value::Number(7.0))]),
        HashMap::from([(CellAddress::new(1, 1), "=A2+".into())]),
    )
    .unwrap();
    let mut history = WorkbookHistory::default();
    history
        .edit_structure(&mut wb, 0, ShiftEdit::RowDelete { at: 1, count: 1 })
        .unwrap();
    history.undo(&mut wb).unwrap();
    assert_eq!(
        wb.sheet(0).unwrap().get_formula("B2").as_deref(),
        Some("=A2+")
    );
    assert_eq!(wb.get_cell("Sheet1", "A2"), Value::Number(7.0));
    assert_eq!(
        wb.get_cell("Sheet1", "B2"),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn untouched_and_restored_scalar_formulas_stay_lazy_until_read() {
    let mut wb = Workbook::new();
    wb.sheet_mut(0).unwrap().bulk_load(|loader| {
        loader.set_cell("A10", Value::Number(7.0));
        loader.set_formula("B10", "=A10*2");
        loader.set_formula("C1", "=A10*3");
        loader.set_formula("D1", "=1+2");
    });
    let mut history = WorkbookHistory::default();
    history
        .edit_structure(&mut wb, 0, ShiftEdit::RowDelete { at: 9, count: 1 })
        .unwrap();
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.debug_formula_eval_count(0), 0);
    assert_eq!(
        wb.sheet(0).unwrap().debug_dep_graph_stats().formula_count,
        0
    );
    assert_eq!(wb.get_cell("Sheet1", "B10"), Value::Number(14.0));
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(21.0));
}

#[test]
fn undo_publishes_one_final_value_and_redo_does_not_duplicate_callbacks() {
    let (mut wb, mut history) = inserted();
    let calls = Rc::new(Cell::new(0));
    let observed = calls.clone();
    let _subscription = wb
        .sheet_mut(0)
        .unwrap()
        .subscribe_cell("A2", move || observed.set(observed.get() + 1));
    history.undo(&mut wb).unwrap();
    assert_eq!(calls.get(), 1);
    history.redo(&mut wb).unwrap();
    assert_eq!(calls.get(), 2);
}

#[test]
fn whole_column_ranges_above_the_edit_see_restored_sparse_membership() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A10", Value::Number(7.0));
    wb.set_formula(0, "C1", "=SUM(A:A)");
    let mut history = WorkbookHistory::default();
    history
        .edit_structure(&mut wb, 0, ShiftEdit::RowDelete { at: 9, count: 1 })
        .unwrap();
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(0.0));
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(7.0));
    history.redo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(0.0));
}

#[test]
fn repeated_replay_does_not_accumulate_cell_or_formula_atoms() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A2", Value::Number(7.0));
    wb.set_formula(0, "B2", "=A2*2");
    wb.set_formula(0, "C1", "=SUM(B:B)");
    let mut history = WorkbookHistory::default();
    history
        .edit_structure(&mut wb, 0, ShiftEdit::RowDelete { at: 1, count: 1 })
        .unwrap();
    let mut settled = None;
    for _ in 0..10 {
        history.undo(&mut wb).unwrap();
        assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(14.0));
        history.redo(&mut wb).unwrap();
        assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(0.0));
        let atoms = wb.debug_total_atom_count(0);
        if let Some(previous) = settled {
            assert_eq!(atoms, previous);
        }
        settled = Some(atoms);
    }
}

#[test]
fn conflicting_table_name_rejects_undo_without_restoring_half_a_row() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Text("Header".into()));
    wb.set_cell(0, "A2", Value::Number(7.0));
    let range = CellRange::new(CellAddress::new(0, 0), CellAddress::new(1, 0));
    wb.define_table(Some("Orders"), 0, range, true).unwrap();
    let other = wb.add_sheet("Other");
    let mut history = WorkbookHistory::default();
    history
        .edit_structure(&mut wb, 0, ShiftEdit::RowDelete { at: 0, count: 1 })
        .unwrap();
    wb.define_table(Some("Orders"), other, range, true).unwrap();
    assert!(history.undo(&mut wb).is_err());
    assert_eq!(history.undo_count(), 1);
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(7.0));
    assert_eq!(wb.get_table("Orders").unwrap().sheet_name(), "Other");
    wb.delete_table("Orders").unwrap();
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Text("Header".into()));
}

#[test]
fn structure_interleaves_with_worksheet_rename_move_and_cell_edit_history() {
    let (mut wb, mut history) = inserted();
    wb.add_sheet("Other");
    history.edit_sheet(&mut wb, Some(0), "Orders").unwrap();
    history.move_sheet(&mut wb, 0, 1).unwrap();
    let addr = CellAddress::new(2, 0);
    history
        .begin(&wb, 1, CellRange::new(addr, addr), "Edit cell", true)
        .unwrap();
    wb.set_cell_input(1, "A3", "20").unwrap();
    history.finish(&mut wb, true).unwrap();
    for _ in 0..4 {
        history.undo(&mut wb).unwrap();
    }
    assert_eq!(wb.get_cell("Sheet1", "A2"), Value::Number(7.0));
    for _ in 0..4 {
        history.redo(&mut wb).unwrap();
    }
    assert_eq!(wb.name(1), Some("Orders"));
    assert_eq!(wb.get_cell("Orders", "A3"), Value::Number(20.0));
}
