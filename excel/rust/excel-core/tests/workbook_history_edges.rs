use einfach_core::Value;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, CellStyle, StyleScope, Workbook};

fn range(r1: u32, c1: u32, r2: u32, c2: u32) -> CellRange {
    CellRange::new(CellAddress::new(r1, c1), CellAddress::new(r2, c2))
}

#[test]
fn row_style_undo_restores_crossing_column_overrides() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    let target = range(0, 0, 0, 16383);
    wb.sheet_mut(0).unwrap().patch_format_range(
        range(0, 1, 1048575, 1),
        StyleScope::Column,
        CellStyle {
            bold: Some(true),
            ..Default::default()
        },
    );
    history.begin(&wb, 0, target, "Row format", false).unwrap();
    wb.sheet_mut(0).unwrap().patch_format_range(
        target,
        StyleScope::Row,
        CellStyle {
            bold: Some(false),
            ..Default::default()
        },
    );
    history.finish(&mut wb, true).unwrap();
    assert!(!wb.sheet(0).unwrap().effective_format("B1").bold);
    assert!(wb.sheet(0).unwrap().effective_format("B2").bold);
    history.undo(&mut wb).unwrap();
    assert!(wb.sheet(0).unwrap().effective_format("B1").bold);
    history.redo(&mut wb).unwrap();
    assert!(!wb.sheet(0).unwrap().effective_format("B1").bold);
    assert!(wb.sheet(0).unwrap().effective_format("B2").bold);
}

#[test]
fn capacity_keeps_the_newest_fifty_steps_and_explains_eviction() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    for n in 1..=52 {
        history
            .begin(&wb, 0, range(0, 0, 0, 0), "Edit", true)
            .unwrap();
        wb.set_cell_input(0, "A1", &n.to_string()).unwrap();
        history.finish(&mut wb, true).unwrap();
    }
    assert_eq!(history.undo_count(), 50);
    assert!(history.notice().unwrap().contains("dropped"));
    for _ in 0..50 {
        assert!(history.undo(&mut wb).unwrap());
    }
    assert!(!history.undo(&mut wb).unwrap());
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(2.0));
    for _ in 0..50 {
        assert!(history.redo(&mut wb).unwrap());
    }
    assert!(!history.redo(&mut wb).unwrap());
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(52.0));
}

#[test]
fn empty_text_and_sparse_formulas_survive_range_clear() {
    let mut wb = Workbook::new();
    wb.set_cell_input(0, "A1", "'").unwrap();
    wb.set_formula(0, "B3", "=7+8");
    let mut history = WorkbookHistory::default();
    let target = range(0, 0, 3, 2);
    history.begin(&wb, 0, target, "Clear", true).unwrap();
    wb.clear_range(0, target);
    history.finish(&mut wb, true).unwrap();
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Text("".into()));
    assert_eq!(wb.get_cell("Sheet1", "A2"), Value::Null);
    assert_eq!(wb.sheet(0).unwrap().get_formula("B3"), Some("=7+8".into()));
    assert_eq!(wb.get_cell("Sheet1", "B3"), Value::Number(15.0));
    history.redo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "B3"), Value::Null);
}

#[test]
fn spilling_formula_restores_children_as_calculation_not_literal_cells() {
    let mut wb = Workbook::new();
    wb.set_formula(0, "A1", "=SEQUENCE(3)");
    assert!(matches!(wb.get_cell("Sheet1", "A1"), Value::Array(_)));
    assert_eq!(wb.get_cell("Sheet1", "A3"), Value::Number(3.0));
    let mut history = WorkbookHistory::default();
    let target = range(0, 0, 2, 0);
    history.begin(&wb, 0, target, "Clear", true).unwrap();
    wb.clear_range(0, target);
    history.finish(&mut wb, true).unwrap();
    history.undo(&mut wb).unwrap();
    assert!(matches!(wb.get_cell("Sheet1", "A1"), Value::Array(_)));
    assert_eq!(wb.get_cell("Sheet1", "A3"), Value::Number(3.0));
    assert_eq!(
        wb.sheet(0)
            .unwrap()
            .spill_anchor_for(CellAddress::new(2, 0)),
        Some(CellAddress::new(0, 0))
    );
    history.redo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A3"), Value::Null);
}

#[test]
fn reset_sizes_undo_restores_initial_axis_metadata() {
    let mut wb = Workbook::new();
    let target = range(0, 0, 0, 0);
    wb.sheet_mut(0)
        .unwrap()
        .resize_range(target, "row", 40)
        .unwrap();
    wb.sheet_mut(0)
        .unwrap()
        .resize_range(target, "column", 200)
        .unwrap();
    let mut history = WorkbookHistory::default();
    history.begin(&wb, 0, target, "Reset sizes", false).unwrap();
    wb.sheet_mut(0)
        .unwrap()
        .resize_range(target, "reset", 0)
        .unwrap();
    history.finish(&mut wb, true).unwrap();
    assert_eq!(wb.sheet(0).unwrap().row_height(0), None);
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.sheet(0).unwrap().row_height(0), Some(40));
    assert_eq!(wb.sheet(0).unwrap().col_width(0), Some(200));
    history.redo(&mut wb).unwrap();
    assert_eq!(wb.sheet(0).unwrap().row_height(0), None);
    assert_eq!(wb.sheet(0).unwrap().col_width(0), None);
}
