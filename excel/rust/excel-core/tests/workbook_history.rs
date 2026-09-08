use einfach_core::Value;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, CellStyle, StyleScope, Workbook};

fn single(row: u32, col: u32) -> CellRange {
    CellRange::single(CellAddress::new(row, col))
}

#[test]
fn cell_undo_redo_restores_raw_types_and_recalculates_cross_sheet_dependents() {
    let mut wb = Workbook::new();
    wb.set_cell_input(0, "A1", "'00123").unwrap();
    let second = wb.add_sheet("Summary");
    wb.set_formula(second, "A1", "=Sheet1!A1");
    let mut history = WorkbookHistory::default();
    history
        .begin(&wb, 0, single(0, 0), "Edit A1", true)
        .unwrap();
    wb.set_cell_input(0, "A1", "12.3456789").unwrap();
    history.finish(&mut wb, true).unwrap();
    assert_eq!(wb.get_cell("Summary", "A1"), Value::Number(12.3456789));
    assert!(history.undo(&mut wb).unwrap());
    assert_eq!(wb.get_cell("Summary", "A1"), Value::Text("00123".into()));
    assert!(history.redo(&mut wb).unwrap());
    assert_eq!(wb.get_cell("Summary", "A1"), Value::Number(12.3456789));
}

#[test]
fn undo_preserves_formula_sources_without_evaluating_unread_formulas_for_snapshot() {
    let mut wb = Workbook::new();
    wb.set_formula(0, "A1", "=1+2");
    let before = wb.debug_formula_eval_count(0);
    let mut history = WorkbookHistory::default();
    history
        .begin(&wb, 0, single(0, 0), "Edit A1", true)
        .unwrap();
    assert_eq!(wb.debug_formula_eval_count(0), before);
    wb.set_cell_input(0, "A1", "TRUE").unwrap();
    history.finish(&mut wb, true).unwrap();
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.sheet(0).unwrap().get_formula("A1"), Some("=1+2".into()));
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(3.0));
    history.redo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Boolean(true));
}

#[test]
fn undo_percent_input_restores_original_number_format_and_row_height() {
    let mut wb = Workbook::new();
    wb.set_cell_input(0, "A1", "before").unwrap();
    let mut history = WorkbookHistory::default();
    history
        .begin(&wb, 0, single(0, 0), "Edit A1", true)
        .unwrap();
    wb.set_cell_input(0, "A1", "12.50%").unwrap();
    history.finish(&mut wb, true).unwrap();
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Text("before".into()));
    assert_eq!(
        wb.sheet(0).unwrap().effective_format("A1").number_format,
        einfach_excel_core::NumberFormat::General
    );
    history.redo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(0.125));
}

#[test]
fn format_and_size_undo_keep_values_and_restore_auto_grown_row_height() {
    let mut wb = Workbook::new();
    wb.set_cell_input(0, "A1", "7").unwrap();
    let mut history = WorkbookHistory::default();
    history
        .begin(&wb, 0, single(0, 0), "Format A1", false)
        .unwrap();
    wb.sheet_mut(0).unwrap().patch_format_range(
        single(0, 0),
        StyleScope::Cell,
        CellStyle {
            font_size: Some(Some(36)),
            ..Default::default()
        },
    );
    history.finish(&mut wb, true).unwrap();
    assert!(wb.sheet(0).unwrap().row_height(0).unwrap() > 36);
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.sheet(0).unwrap().row_height(0), None);
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(7.0));
    history.redo(&mut wb).unwrap();
    history
        .begin(&wb, 0, single(0, 0), "Resize column", false)
        .unwrap();
    wb.sheet_mut(0)
        .unwrap()
        .resize_range(single(0, 0), "column", 200)
        .unwrap();
    history.finish(&mut wb, true).unwrap();
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.sheet(0).unwrap().col_width(0), None);
    assert_eq!(history.undo_count(), 1);
    assert_eq!(history.redo_count(), 1);
}

#[test]
fn grouped_clear_is_one_entry_and_new_edit_discards_redo_but_noop_does_not() {
    let mut wb = Workbook::new();
    wb.set_cell_input(0, "A1", "7").unwrap();
    wb.set_cell_input(0, "A2", "8").unwrap();
    let range = CellRange::new(CellAddress::new(0, 0), CellAddress::new(1, 0));
    let mut history = WorkbookHistory::default();
    history.begin(&wb, 0, range, "Clear", true).unwrap();
    wb.clear_range(0, range);
    history.finish(&mut wb, true).unwrap();
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A2"), Value::Number(8.0));
    history.begin(&wb, 0, single(0, 0), "No-op", true).unwrap();
    wb.set_cell_input(0, "A1", "7").unwrap();
    history.finish(&mut wb, true).unwrap();
    assert_eq!(history.redo_count(), 1);
    history.begin(&wb, 0, single(0, 0), "Edit", true).unwrap();
    wb.set_cell_input(0, "A1", "9").unwrap();
    history.finish(&mut wb, true).unwrap();
    assert_eq!(history.redo_count(), 0);
    history.clear("History reset by sheet structure change.");
    assert_eq!(history.undo_count(), 0);
    assert!(history.notice().unwrap().contains("structure"));
}

#[test]
fn history_rejects_nested_and_invalid_targets_and_rolls_back_failed_group() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    assert!(history.begin(&wb, 1, single(0, 0), "Edit", true).is_err());
    history.begin(&wb, 0, single(0, 0), "Edit", true).unwrap();
    assert!(history.begin(&wb, 0, single(0, 0), "Nested", true).is_err());
    wb.set_cell_input(0, "A1", "partial").unwrap();
    history.finish(&mut wb, false).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Null);
    assert_eq!(history.undo_count(), 0);
}
