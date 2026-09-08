//! 原生插删行列历史的值、公式、尺寸及跨表回放。
use einfach_core::Value;
use einfach_excel_core::shift::ShiftEdit;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, CellStyle, StyleScope, Workbook};

fn point(addr: &str) -> CellRange {
    let addr = CellAddress::parse(addr).unwrap();
    CellRange::new(addr, addr)
}

fn seed() -> Workbook {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A2", Value::Number(7.0));
    wb.set_formula(0, "C1", "=SUM(A1:A3)");
    wb.set_formula(0, "C2", "=A2*2");
    let summary = wb.add_sheet("Summary");
    wb.set_formula(summary, "A1", "=IFERROR(Sheet1!A2,99)");
    wb
}

#[test]
fn all_four_edits_restore_exact_formula_sources_and_cross_sheet_results() {
    for edit in [
        ShiftEdit::RowInsert { at: 1, count: 2 },
        ShiftEdit::RowDelete { at: 1, count: 1 },
        ShiftEdit::ColInsert { at: 0, count: 2 },
        ShiftEdit::ColDelete { at: 0, count: 1 },
    ] {
        let mut wb = seed();
        let mut history = WorkbookHistory::default();
        assert!(history.edit_structure(&mut wb, 0, edit).unwrap());
        let shifted = wb.sheet(1).unwrap().get_formula("A1");
        let shifted_value = wb.get_cell("Summary", "A1");
        assert_eq!(
            history.entries().next().unwrap().affected_sheets(),
            vec![0, 1]
        );
        for _ in 0..3 {
            assert!(history.undo(&mut wb).unwrap());
            assert_eq!(wb.get_cell("Sheet1", "A2"), Value::Number(7.0));
            assert_eq!(wb.get_cell("Sheet1", "C2"), Value::Number(14.0));
            assert_eq!(
                wb.sheet(0).unwrap().get_formula("C1").as_deref(),
                Some("=SUM(A1:A3)")
            );
            assert_eq!(
                wb.sheet(1).unwrap().get_formula("A1").as_deref(),
                Some("=IFERROR(Sheet1!A2,99)")
            );
            assert_eq!(wb.get_cell("Summary", "A1"), Value::Number(7.0));
            assert!(history.redo(&mut wb).unwrap());
            assert_eq!(wb.sheet(1).unwrap().get_formula("A1"), shifted);
            assert_eq!(wb.get_cell("Summary", "A1"), shifted_value);
        }
    }
}

#[test]
fn deleting_a_styled_row_restores_its_height_style_and_hidden_index() {
    let mut wb = seed();
    wb.sheet_mut(0).unwrap().set_row_height(1, 80);
    wb.sheet_mut(0).unwrap().patch_format_range(
        point("A2"),
        StyleScope::Row,
        CellStyle {
            bold: Some(true),
            ..Default::default()
        },
    );
    wb.hide_rows(0, &[1]);
    let format = wb.sheet(0).unwrap().effective_format("A2");
    let mut history = WorkbookHistory::default();
    history
        .edit_structure(&mut wb, 0, ShiftEdit::RowDelete { at: 1, count: 1 })
        .unwrap();
    assert!(wb.list_hidden_rows(0).is_empty());
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.list_hidden_rows(0), vec![1]);
    assert_eq!(wb.sheet(0).unwrap().row_height(1), Some(80));
    assert_eq!(wb.sheet(0).unwrap().effective_format("A2"), format);
    history.redo(&mut wb).unwrap();
    assert!(wb.list_hidden_rows(0).is_empty());
}

#[test]
fn deleted_columns_restore_widths_and_layered_cell_formatting() {
    let mut wb = seed();
    wb.sheet_mut(0).unwrap().set_col_width(0, 222);
    wb.sheet_mut(0).unwrap().patch_format_range(
        point("A2"),
        StyleScope::Column,
        CellStyle {
            italic: Some(true),
            ..Default::default()
        },
    );
    let before = wb.sheet(0).unwrap().effective_format("A2");
    let mut history = WorkbookHistory::default();
    history
        .set_visibility(&mut wb, 0, point("A2"), "hide-columns")
        .unwrap();
    history
        .edit_structure(&mut wb, 0, ShiftEdit::ColDelete { at: 0, count: 1 })
        .unwrap();
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.sheet_visibility(0).unwrap().columns, vec![0]);
    assert_eq!(wb.sheet(0).unwrap().col_width(0), Some(222));
    assert_eq!(wb.sheet(0).unwrap().effective_format("A2"), before);
    history.undo(&mut wb).unwrap();
    assert!(wb.sheet_visibility(0).unwrap().columns.is_empty());
}

#[test]
fn deleted_spill_anchors_restore_formulas_instead_of_materializing_their_children() {
    let mut wb = Workbook::new();
    wb.set_formula(0, "A2", "=SEQUENCE(3)");
    let mut history = WorkbookHistory::default();
    history
        .edit_structure(&mut wb, 0, ShiftEdit::RowDelete { at: 1, count: 3 })
        .unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A2"), Value::Null);
    for _ in 0..3 {
        history.undo(&mut wb).unwrap();
        assert_eq!(wb.get_cell("Sheet1", "A4"), Value::Number(3.0));
        assert_eq!(
            wb.sheet(0).unwrap().get_formula("A2").as_deref(),
            Some("=SEQUENCE(3)")
        );
        assert_eq!(
            wb.sheet(0)
                .unwrap()
                .spill_anchor_for(CellAddress::new(3, 0)),
            Some(CellAddress::new(1, 0))
        );
        history.redo(&mut wb).unwrap();
        assert_eq!(wb.get_cell("Sheet1", "A4"), Value::Null);
    }
}

#[test]
fn editing_after_undo_uses_restored_dependencies() {
    let mut wb = seed();
    let mut history = WorkbookHistory::default();
    history
        .edit_structure(&mut wb, 0, ShiftEdit::RowDelete { at: 1, count: 1 })
        .unwrap();
    history.undo(&mut wb).unwrap();
    wb.set_cell(0, "A2", Value::Number(15.0));
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(15.0));
    assert_eq!(wb.get_cell("Sheet1", "C2"), Value::Number(30.0));
    assert_eq!(wb.get_cell("Summary", "A1"), Value::Number(15.0));
}

#[test]
fn unrelated_sheets_and_unmoved_prefix_data_do_not_consume_the_history_budget() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Text("x".repeat(33 * 1024 * 1024)));
    let other = wb.add_sheet("Unrelated");
    wb.set_cell(other, "A1", Value::Text("y".repeat(33 * 1024 * 1024)));
    wb.set_cell(0, "A10", Value::Number(10.0));
    let mut history = WorkbookHistory::default();
    history
        .edit_structure(&mut wb, 0, ShiftEdit::RowInsert { at: 9, count: 1 })
        .unwrap();
    assert_eq!(
        history.undo_count(),
        1,
        "unrelated 66 MiB must not be retained by history"
    );
    assert_eq!(history.entries().next().unwrap().affected_sheets(), vec![0]);
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A10"), Value::Number(10.0));
}

#[test]
fn deleting_a_table_header_restores_its_definition_and_structured_results() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Text("Qty".into()));
    wb.set_cell(0, "A2", Value::Number(7.0));
    wb.define_table(
        Some("Orders"),
        0,
        CellRange::new(CellAddress::new(0, 0), CellAddress::new(1, 0)),
        true,
    )
    .unwrap();
    let other = wb.add_sheet("Summary");
    wb.set_formula(other, "A1", "=SUM(Orders[Qty])");
    assert_eq!(wb.get_cell("Summary", "A1"), Value::Number(7.0));
    let before = wb.get_table("Orders").cloned();
    let mut history = WorkbookHistory::default();
    history
        .edit_structure(&mut wb, 0, ShiftEdit::RowDelete { at: 0, count: 1 })
        .unwrap();
    assert!(wb.get_table("Orders").is_none());
    for _ in 0..3 {
        history.undo(&mut wb).unwrap();
        assert_eq!(wb.get_table("Orders").cloned(), before);
        assert_eq!(wb.get_cell("Summary", "A1"), Value::Number(7.0));
        history.redo(&mut wb).unwrap();
        assert!(wb.get_table("Orders").is_none());
        assert!(matches!(wb.get_cell("Summary", "A1"), Value::Error(_)));
    }
}

#[test]
fn filter_visibility_is_restored_as_a_snapshot_without_rerunning_predicates() {
    use einfach_excel_core::filter::ColumnFilterRule;
    let mut wb = Workbook::new();
    for (addr, value) in [("A1", "Qty"), ("A2", "7"), ("A3", "20")] {
        wb.set_cell_input(0, addr, value).unwrap();
    }
    wb.apply_filter(
        0,
        &[ColumnFilterRule::Range {
            col_index: 0,
            min: Some(10.0),
            max: None,
        }],
    )
    .unwrap();
    let before = wb.snapshot_filters();
    let scans = wb.debug_filter_scan_count(0);
    let mut history = WorkbookHistory::default();
    history
        .edit_structure(&mut wb, 0, ShiftEdit::RowDelete { at: 1, count: 1 })
        .unwrap();
    let after = wb.snapshot_filters();
    assert_ne!(before, after);
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.snapshot_filters(), before);
    history.redo(&mut wb).unwrap();
    assert_eq!(wb.snapshot_filters(), after);
    assert_eq!(wb.debug_filter_scan_count(0), scans);
}
