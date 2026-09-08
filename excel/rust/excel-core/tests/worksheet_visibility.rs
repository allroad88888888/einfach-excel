//! 可见性只改原生行列属性；值、尺寸、筛选来源、历史身份均独立验证。
use einfach_core::Value;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, Workbook};

fn range(first: &str, last: &str) -> CellRange {
    CellRange::new(
        CellAddress::parse(first).unwrap(),
        CellAddress::parse(last).unwrap(),
    )
}

#[test]
fn hiding_rows_preserves_values_styles_sizes_and_recalculates_only_hidden_aware_results() {
    let mut wb = Workbook::new();
    for (cell, value) in [("A1", "1"), ("A2", "2"), ("A3", "3")] {
        wb.set_cell_input(0, cell, value).unwrap();
    }
    wb.sheet_mut(0).unwrap().set_row_height(1, 80);
    wb.sheet_mut(0).unwrap().set_col_width(0, 200);
    wb.set_formula(0, "C1", "=SUM(A1:A3)");
    wb.set_formula(0, "C2", "=SUBTOTAL(109,A1:A3)");
    wb.set_formula(0, "C3", "=SUBTOTAL(9,A1:A3)");
    let format = wb.sheet(0).unwrap().get_format("A2");
    assert_eq!(wb.get_cell("Sheet1", "C2"), Value::Number(6.0));
    let mut history = WorkbookHistory::default();
    assert!(history
        .set_visibility(&mut wb, 0, range("A2", "B2"), "hide-rows")
        .unwrap());
    assert_eq!(wb.sheet_visibility(0).unwrap().rows, vec![1]);
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(6.0));
    assert_eq!(wb.get_cell("Sheet1", "C2"), Value::Number(4.0));
    assert_eq!(wb.get_cell("Sheet1", "C3"), Value::Number(6.0));
    assert_eq!(wb.get_cell("Sheet1", "A2"), Value::Number(2.0));
    assert_eq!(wb.sheet(0).unwrap().get_format("A2"), format);
    assert_eq!(wb.sheet(0).unwrap().row_height(1), Some(80));
    assert_eq!(wb.sheet(0).unwrap().col_width(0), Some(200));
    history.undo(&mut wb).unwrap();
    assert!(wb.sheet_visibility(0).unwrap().rows.is_empty());
    assert_eq!(wb.get_cell("Sheet1", "C2"), Value::Number(6.0));
    history.redo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "C2"), Value::Number(4.0));
}

#[test]
fn hiding_columns_is_native_metadata_and_does_not_evaluate_or_change_column_widths() {
    let mut wb = Workbook::new();
    wb.sheet_mut(0).unwrap().set_col_width(1, 200);
    wb.set_formula(0, "B1", "=1+2");
    wb.set_formula(0, "D1", "=B1*2");
    let evals = wb.debug_formula_eval_count(0);
    let mut history = WorkbookHistory::default();
    history
        .set_visibility(&mut wb, 0, range("B1", "C8"), "hide-columns")
        .unwrap();
    assert_eq!(wb.sheet_visibility(0).unwrap().columns, vec![1, 2]);
    assert_eq!(wb.debug_formula_eval_count(0), evals);
    assert_eq!(wb.sheet(0).unwrap().col_width(1), Some(200));
    assert_eq!(wb.get_cell("Sheet1", "D1"), Value::Number(6.0));
    history.undo(&mut wb).unwrap();
    assert!(wb.sheet_visibility(0).unwrap().columns.is_empty());
    history.redo(&mut wb).unwrap();
    assert_eq!(wb.sheet_visibility(0).unwrap().columns, vec![1, 2]);
}

#[test]
fn unhide_changes_only_selected_axes_and_keeps_filter_hidden_rows() {
    let mut wb = Workbook::new();
    wb.set_eval_filter_hidden_rows(0, &[2]);
    let mut history = WorkbookHistory::default();
    history
        .set_visibility(&mut wb, 0, range("A2", "A5"), "hide-rows")
        .unwrap();
    history
        .set_visibility(&mut wb, 0, range("B1", "E1"), "hide-columns")
        .unwrap();
    history
        .set_visibility(&mut wb, 0, range("C3", "D4"), "unhide")
        .unwrap();
    let after = wb.sheet_visibility(0).unwrap();
    assert_eq!(after.rows, vec![1, 4]);
    assert_eq!(after.columns, vec![1, 4]);
    assert_eq!(wb.filter_hidden_rows(0), vec![2]);
    assert_eq!(history.undo_count(), 3);
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.sheet_visibility(0).unwrap().rows, vec![1, 2, 3, 4]);
    assert_eq!(wb.sheet_visibility(0).unwrap().columns, vec![1, 2, 3, 4]);
    assert_eq!(wb.filter_hidden_rows(0), vec![2]);
    history.redo(&mut wb).unwrap();
    assert_eq!(wb.sheet_visibility(0).unwrap(), after);
}

#[test]
fn invalid_and_unchanged_commands_are_atomic_and_preserve_redo() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    history
        .set_visibility(&mut wb, 0, range("A1", "A1"), "hide-rows")
        .unwrap();
    history.undo(&mut wb).unwrap();
    let before = wb.sheet_visibility(0).unwrap();
    for (sheet, target, action) in [
        (9, range("A1", "A1"), "hide-rows"),
        (0, range("B2", "A1"), "hide-rows"),
        (
            0,
            CellRange::new(CellAddress::new(0, 0), CellAddress::new(1_048_576, 0)),
            "hide-rows",
        ),
        (
            0,
            CellRange::new(CellAddress::new(0, 0), CellAddress::new(0, 16_384)),
            "hide-columns",
        ),
        (0, range("A1", "A1"), "unknown"),
    ] {
        assert!(history
            .set_visibility(&mut wb, sheet, target, action)
            .is_err());
        assert_eq!(wb.sheet_visibility(0).unwrap(), before);
        assert_eq!(history.redo_count(), 1);
    }
    assert!(!history
        .set_visibility(&mut wb, 0, range("A1", "A1"), "unhide")
        .unwrap());
    assert_eq!(history.redo_count(), 1);
    history.redo(&mut wb).unwrap();
    assert!(!history
        .set_visibility(&mut wb, 0, range("A1", "A1"), "hide-rows")
        .unwrap());
    assert_eq!(history.undo_count(), 1);
    history
        .begin(&wb, 0, range("A1", "A1"), "Edit", true)
        .unwrap();
    assert!(history
        .set_visibility(&mut wb, 0, range("A1", "A1"), "unhide")
        .is_err());
    history.finish(&mut wb, false).unwrap();
}

#[test]
fn hidden_axes_survive_move_delete_restore_and_mixed_history() {
    let mut wb = Workbook::new();
    wb.add_sheet("Second");
    let mut history = WorkbookHistory::default();
    history
        .set_visibility(&mut wb, 0, range("B2", "D4"), "hide-columns")
        .unwrap();
    history
        .set_visibility(&mut wb, 0, range("B2", "D4"), "hide-rows")
        .unwrap();
    let state = wb.sheet_visibility(0).unwrap();
    history.move_sheet(&mut wb, 0, 1).unwrap();
    history.remove_sheet(&mut wb, 1).unwrap();
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.sheet_visibility(1).unwrap(), state);
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.sheet_visibility(0).unwrap(), state);
    history.undo(&mut wb).unwrap();
    assert!(wb.sheet_visibility(0).unwrap().rows.is_empty());
    assert_eq!(wb.sheet_visibility(0).unwrap().columns, state.columns);
    history.undo(&mut wb).unwrap();
    assert!(wb.sheet_visibility(0).unwrap().columns.is_empty());
    assert!(wb.sheet_visibility(1).unwrap().rows.is_empty());
}

#[test]
fn column_structure_displaces_hidden_state_and_replacement_identity_rejects_history() {
    let mut wb = Workbook::new();
    wb.add_sheet("Second");
    let mut history = WorkbookHistory::default();
    history
        .set_visibility(&mut wb, 1, range("C1", "D1"), "hide-columns")
        .unwrap();
    wb.insert_columns(1, 1, 2);
    assert_eq!(wb.sheet_visibility(1).unwrap().columns, vec![4, 5]);
    wb.delete_columns(1, 4, 1);
    assert_eq!(wb.sheet_visibility(1).unwrap().columns, vec![4]);
    wb.remove_sheet(1).unwrap();
    wb.add_sheet("Second");
    assert!(history.undo(&mut wb).is_err());
    assert!(wb.sheet_visibility(1).unwrap().columns.is_empty());
    assert_eq!(history.undo_count(), 1);
}

#[test]
fn all_hidden_axes_can_be_restored_without_materializing_cells() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    let target = range("A1", "XFD1001");
    history
        .set_visibility(&mut wb, 0, target, "hide-rows")
        .unwrap();
    history
        .set_visibility(&mut wb, 0, target, "hide-columns")
        .unwrap();
    assert_eq!(wb.sheet_visibility(0).unwrap().rows.len(), 1001);
    assert_eq!(wb.sheet_visibility(0).unwrap().columns.len(), 16_384);
    history
        .set_visibility(&mut wb, 0, target, "unhide")
        .unwrap();
    assert!(wb.sheet_visibility(0).unwrap().rows.is_empty());
    assert!(wb.sheet_visibility(0).unwrap().columns.is_empty());
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.sheet_visibility(0).unwrap().columns.len(), 16_384);
    assert_eq!(wb.debug_formula_eval_count(0), 0);
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Null);
}
