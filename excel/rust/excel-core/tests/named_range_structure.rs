//! 命名区域与源数据在同一原生结构事务中移动，撤销恢复的是定义而非值快照。
use einfach_core::{Value, ValueError};
use einfach_excel_core::shift::ShiftEdit;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, Workbook};

fn range(start: &str, end: &str) -> CellRange {
    CellRange::new(
        CellAddress::parse(start).unwrap(),
        CellAddress::parse(end).unwrap(),
    )
}

fn seed() -> Workbook {
    let mut wb = Workbook::new();
    wb.set_cell(0, "B2", Value::Number(10.0));
    wb.set_cell(0, "C3", Value::Number(20.0));
    wb.define_named_range("Sales", 0, range("B2", "C4"))
        .unwrap();
    let summary = wb.add_sheet("Summary");
    assert!(wb.set_formula(summary, "A1", "=SUM(Sales)"));
    assert_eq!(wb.get_cell("Summary", "A1"), Value::Number(30.0));
    wb
}

#[test]
fn row_column_edits_move_and_shrink_names_with_repeatable_history() {
    for (edit, start, end, sum) in [
        (ShiftEdit::RowInsert { at: 2, count: 2 }, "B2", "C6", 30.0),
        (ShiftEdit::ColInsert { at: 1, count: 2 }, "D2", "E4", 30.0),
        (ShiftEdit::RowDelete { at: 1, count: 1 }, "B2", "C3", 20.0),
        (ShiftEdit::ColDelete { at: 2, count: 1 }, "B2", "B4", 10.0),
    ] {
        let mut wb = seed();
        let mut history = WorkbookHistory::default();
        history.edit_structure(&mut wb, 0, edit).unwrap();
        for _ in 0..3 {
            assert_eq!(
                wb.named_range("Sales"),
                Ok(Some(("Sheet1".into(), range(start, end))))
            );
            assert_eq!(wb.get_cell("Summary", "A1"), Value::Number(sum));
            assert!(history.undo(&mut wb).unwrap());
            assert_eq!(
                wb.named_range("Sales"),
                Ok(Some(("Sheet1".into(), range("B2", "C4"))))
            );
            assert_eq!(wb.get_cell("Summary", "A1"), Value::Number(30.0));
            assert!(history.redo(&mut wb).unwrap());
        }
    }
}

#[test]
fn deleting_all_source_cells_keeps_ref_error_and_undo_restores_definition() {
    let mut wb = seed();
    let mut history = WorkbookHistory::default();
    history
        .edit_structure(&mut wb, 0, ShiftEdit::RowDelete { at: 1, count: 3 })
        .unwrap();
    assert_eq!(wb.named_range("Sales"), Err(ValueError::InvalidRef));
    assert_eq!(
        wb.get_cell("Summary", "A1"),
        Value::Error(ValueError::InvalidRef)
    );
    assert_eq!(wb.named_names().collect::<Vec<_>>(), vec!["Sales"]);
    history.undo(&mut wb).unwrap();
    wb.set_cell(0, "B2", Value::Number(15.0));
    assert_eq!(wb.get_cell("Summary", "A1"), Value::Number(35.0));
    history.redo(&mut wb).unwrap();
    assert_eq!(wb.named_range("Sales"), Err(ValueError::InvalidRef));
}

#[test]
fn metadata_only_out_of_bounds_insert_is_rejected_without_consuming_redo() {
    let mut wb = seed();
    let mut history = WorkbookHistory::default();
    history
        .edit_structure(&mut wb, 0, ShiftEdit::RowInsert { at: 0, count: 1 })
        .unwrap();
    history.undo(&mut wb).unwrap();
    wb.define_named_range("Last", 0, range("D1048576", "D1048576"))
        .unwrap();
    assert!(history
        .edit_structure(&mut wb, 0, ShiftEdit::RowInsert { at: 0, count: 1 })
        .is_err());
    assert_eq!(wb.get_cell("Sheet1", "B2"), Value::Number(10.0));
    assert_eq!(
        wb.named_range("Last"),
        Ok(Some(("Sheet1".into(), range("D1048576", "D1048576"))))
    );
    assert!(wb.undefine_name("Last"));
    assert!(history.redo(&mut wb).unwrap());
}

#[test]
fn undo_rejects_external_name_changes_before_touching_cells() {
    let mut wb = seed();
    let mut history = WorkbookHistory::default();
    history
        .edit_structure(&mut wb, 0, ShiftEdit::RowInsert { at: 0, count: 1 })
        .unwrap();
    wb.define_named_range("Sales", 0, range("E1", "E2"))
        .unwrap();
    assert!(history.undo(&mut wb).is_err());
    assert_eq!(wb.get_cell("Sheet1", "B3"), Value::Number(10.0));
    assert_eq!(
        wb.named_range("Sales"),
        Ok(Some(("Sheet1".into(), range("E1", "E2"))))
    );
}

#[test]
fn whole_column_keeps_full_height_while_its_column_moves() {
    let mut wb = seed();
    wb.define_named_range("Entire", 0, range("B1", "B1048576"))
        .unwrap();
    wb.insert_rows(0, 0, 2);
    assert_eq!(
        wb.named_range("Entire"),
        Ok(Some(("Sheet1".into(), range("B1", "B1048576"))))
    );
    wb.insert_columns(0, 0, 1);
    assert_eq!(
        wb.named_range("Entire"),
        Ok(Some(("Sheet1".into(), range("C1", "C1048576"))))
    );
}

#[test]
fn structural_changes_update_cross_sheet_spill_geometry() {
    let mut wb = seed();
    wb.define_named_range("Values", 0, range("B2", "B3"))
        .unwrap();
    assert!(wb.set_formula(1, "D1", "=Values"));
    let mut history = WorkbookHistory::default();
    history
        .edit_structure(&mut wb, 0, ShiftEdit::RowInsert { at: 2, count: 1 })
        .unwrap();
    wb.set_cell(0, "B4", Value::Number(40.0));
    assert_eq!(wb.get_cell("Summary", "D3"), Value::Number(40.0));
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Summary", "D3"), Value::Null);
    assert_eq!(wb.spill_anchor(1, "D2"), Some(CellAddress::new(0, 3)));
}

#[test]
fn structure_history_does_not_restore_unaffected_names() {
    let mut wb = seed();
    wb.define_named_range("Keep", 0, range("D1", "D1")).unwrap();
    let mut history = WorkbookHistory::default();
    history
        .edit_structure(&mut wb, 0, ShiftEdit::RowInsert { at: 1, count: 1 })
        .unwrap();
    wb.define_named_range("Keep", 1, range("E1", "E2")).unwrap();
    history.undo(&mut wb).unwrap();
    assert_eq!(
        wb.named_range("Keep"),
        Ok(Some(("Summary".into(), range("E1", "E2"))))
    );
    assert_eq!(wb.get_cell("Summary", "A1"), Value::Number(30.0));
}

#[test]
fn deleting_and_restoring_a_sheet_restores_named_spill_identity() {
    let mut wb = seed();
    assert!(wb.set_formula(1, "D1", "=Sales"));
    let mut history = WorkbookHistory::default();
    history.remove_sheet(&mut wb, 0).unwrap();
    assert_eq!(wb.named_range("Sales"), Err(ValueError::InvalidRef));
    assert_eq!(
        wb.get_cell("Summary", "D1"),
        Value::Error(ValueError::InvalidRef)
    );
    history.undo(&mut wb).unwrap();
    assert_eq!(
        wb.named_range("Sales"),
        Ok(Some(("Sheet1".into(), range("B2", "C4"))))
    );
    assert_eq!(wb.get_cell("Summary", "E2"), Value::Number(20.0));
    history.redo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Summary", "E2"), Value::Null);
}

#[test]
fn structure_and_history_publish_one_final_named_formula_change() {
    use std::{cell::Cell, rc::Rc};
    let mut wb = seed();
    let hits = Rc::new(Cell::new(0));
    let observed = hits.clone();
    let token = wb
        .sheet_mut(1)
        .unwrap()
        .subscribe_cell("A1", move || observed.set(observed.get() + 1));
    hits.set(0);
    let mut history = WorkbookHistory::default();
    history
        .edit_structure(&mut wb, 0, ShiftEdit::RowDelete { at: 1, count: 1 })
        .unwrap();
    assert_eq!(wb.get_cell("Summary", "A1"), Value::Number(20.0));
    assert_eq!(hits.replace(0), 1);
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Summary", "A1"), Value::Number(30.0));
    assert_eq!(hits.replace(0), 1);
    history.redo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Summary", "A1"), Value::Number(20.0));
    assert_eq!(hits.get(), 1);
    wb.sheet_mut(1).unwrap().unsubscribe_cell(token);
}
