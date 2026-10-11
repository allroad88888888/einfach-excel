//! Table 外观是窗口内默认值；历史、手动格式与转换不得丢失原始数据。
#[path = "support/conditional_format_rule.rs"]
mod support;
use einfach_core::Value;
use einfach_excel_core::clipboard::ClipboardPasteOptions;
use einfach_excel_core::cell_style::StyleScope;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellStyle, TableStyle, TableStylePreset, Workbook};
use std::{cell::Cell, rc::Rc};
use support::{range, rule};

fn seed() -> (Workbook, WorkbookHistory) {
    let mut wb = Workbook::new();
    wb.set_cell(0, "C3", Value::Text("Item".into()));
    wb.set_cell(0, "D3", Value::Text("Amount".into()));
    wb.set_cell(0, "D4", Value::Number(10.));
    wb.define_table(Some("Orders"), 0, range("C3", "D6"), true).unwrap();
    (wb, WorkbookHistory::default())
}
fn blue() -> TableStyle {
    TableStyle { preset: TableStylePreset::Blue, ..Default::default() }
}
fn display(wb: &Workbook, addr: &str) -> CellStyle {
    wb.snapshot_display_format_range(0, range(addr, addr)).unwrap().formats
        .cell_styles.into_iter().next().map(|(_, style)| style).unwrap_or_default()
}
fn background(wb: &Workbook, addr: &str) -> Option<String> {
    display(wb, addr).background.flatten()
}

#[test]
fn presets_and_flags_are_metadata_only_and_bands_anchor_to_the_table() {
    let (mut wb, mut history) = seed();
    let raw = wb.sheet(0).unwrap().snapshot_format_range(range("A1", "F10"));
    for (preset, header, stripe) in [
        (TableStylePreset::Blue, "#1f4e78", "#d9e8f5"),
        (TableStylePreset::Green, "#276347", "#e2efda"),
        (TableStylePreset::Gray, "#4b5563", "#edf0f3"),
    ] {
        history.set_table_style(&mut wb, "Orders", TableStyle { preset, ..blue() }).unwrap();
        assert_eq!(background(&wb, "C3").as_deref(), Some(header));
        assert_eq!(background(&wb, "D4").as_deref(), Some(stripe));
        assert_eq!(background(&wb, "D5").as_deref(), Some("#ffffff"));
        assert_eq!(background(&wb, "D6").as_deref(), Some(stripe));
        assert_eq!(background(&wb, "D7"), None);
        assert_eq!(display(&wb, "C3").bold, Some(true));
        assert_eq!(display(&wb, "C4").bold, Some(false));
    }
    history.set_table_style(&mut wb, "Orders", TableStyle {
        banded_rows: false, first_column: true, ..blue()
    }).unwrap();
    assert_eq!(background(&wb, "D4").as_deref(), Some("#ffffff"));
    assert_eq!(display(&wb, "C4").bold, Some(true));
    assert_eq!(display(&wb, "D4").bold, Some(false));
    assert_eq!(wb.sheet(0).unwrap().snapshot_format_range(range("A1", "F10")), raw);
    history.set_table_style(&mut wb, "Orders", TableStyle::default()).unwrap();
    assert_eq!(display(&wb, "C3"), CellStyle::default());
}

#[test]
fn explicit_cell_row_column_styles_win_and_conditional_formatting_remains_last() {
    let (mut wb, mut history) = seed();
    history.set_table_style(&mut wb, "Orders", blue()).unwrap();
    for (bounds, scope, color) in [
        (range("C4", "C4"), StyleScope::Cell, "#111111"),
        (range("C5", "D5"), StyleScope::Row, "#222222"),
        (range("D3", "D6"), StyleScope::Column, "#333333"),
    ] {
        wb.sheet_mut(0).unwrap().patch_format_range(bounds, scope, CellStyle {
            background: Some(Some(color.into())), ..Default::default()
        });
    }
    assert_eq!(background(&wb, "C4").as_deref(), Some("#111111"));
    assert_eq!(background(&wb, "C5").as_deref(), Some("#222222"));
    assert_eq!(background(&wb, "D5").as_deref(), Some("#333333"));
    wb.sheet_mut(0).unwrap().patch_format_range(range("C3", "C3"), StyleScope::Cell,
        CellStyle { background: Some(None), bold: Some(false), ..Default::default() });
    assert_eq!(background(&wb, "C3"), None);
    assert_eq!(display(&wb, "C3").bold, Some(false));
    wb.set_conditional_format_rule(0, 0, rule("r", range("D4", "D4"), "gt", "5")).unwrap();
    assert_eq!(background(&wb, "D4").as_deref(), Some("#FFC7CE"));
    assert_eq!(wb.sheet(0).unwrap().get_format("D4").background.as_deref(), Some("#333333"));
}

#[test]
fn style_history_notifies_once_and_noop_preserves_redo() {
    let (mut wb, mut history) = seed();
    let report = wb.add_sheet("Report");
    wb.set_formula(report, "A1", "=Orders[#All]");
    wb.set_formula(report, "G1", "=SUM(A1#)");
    assert_eq!(wb.get_cell("Report", "G1"), Value::Number(10.));
    let evaluations = wb.debug_formula_eval_count(report);
    let hits = Rc::new(Cell::new(0));
    let observed = hits.clone();
    wb.sheet_mut(0).unwrap().subscribe_cell("D4", move || observed.set(observed.get() + 1));
    hits.set(0);
    history.set_table_style(&mut wb, "Orders", blue()).unwrap();
    assert_eq!(hits.replace(0), 1);
    assert_eq!(history.undo_count(), 1);
    for _ in 0..2 {
        history.undo(&mut wb).unwrap();
        assert_eq!(hits.replace(0), 1);
        assert_eq!(background(&wb, "D4"), None);
        assert!(!history.set_table_style(&mut wb, "Orders", TableStyle::default()).unwrap());
        assert_eq!(history.redo_count(), 1);
        history.redo(&mut wb).unwrap();
        assert_eq!(hits.replace(0), 1);
        assert_eq!(background(&wb, "D4").as_deref(), Some("#d9e8f5"));
        assert_eq!(wb.get_cell("Report", "G1"), Value::Number(10.));
        assert_eq!(wb.debug_formula_eval_count(report), evaluations,
            "Changing appearance must not invalidate structured-reference formulas");
    }
}

#[test]
fn expanding_resizing_and_totals_reuse_the_same_semantic_style() {
    let (mut wb, mut history) = seed();
    history.set_table_style(&mut wb, "Orders", blue()).unwrap();
    history.set_cell_input(&mut wb, 0, "D7", "20").unwrap();
    assert_eq!(background(&wb, "D7").as_deref(), Some("#ffffff"));
    history.set_cell_input(&mut wb, 0, "E4", "30").unwrap();
    assert_eq!(background(&wb, "E3").as_deref(), Some("#1f4e78"));
    history.resize_table(&mut wb, "Orders", range("C3", "E8")).unwrap();
    assert_eq!(background(&wb, "E8").as_deref(), Some("#d9e8f5"));
    history.set_table_totals_row(&mut wb, "Orders", true).unwrap();
    assert_eq!(background(&wb, "E9").as_deref(), Some("#d9e8f5"));
    assert_eq!(display(&wb, "E9").bold, Some(true));
    assert_eq!(wb.get_table("Orders").unwrap().style(), blue());
}

#[test]
fn converting_preserves_appearance_and_undo_restores_sparse_style_ownership() {
    let (mut wb, mut history) = seed();
    history.set_table_style(&mut wb, "Orders", blue()).unwrap();
    wb.set_formula(0, "D5", "=D4+1");
    wb.set_formula(0, "F1", "=SUM(Orders[Amount])");
    let raw = wb.sheet(0).unwrap().snapshot_format_range(range("C3", "D6"));
    let display_before = wb.snapshot_display_format_range(0, range("C3", "D6")).unwrap();
    history.convert_table_to_range(&mut wb, "Orders").unwrap();
    assert!(wb.get_table("Orders").is_none());
    assert_eq!(wb.snapshot_display_format_range(0, range("C3", "D6")).unwrap(), display_before);
    assert_eq!(wb.get_cell("Sheet1", "F1"), Value::Number(21.));
    for _ in 0..2 {
        history.undo(&mut wb).unwrap();
        assert_eq!(wb.get_table("Orders").unwrap().style(), blue());
        assert_eq!(wb.sheet(0).unwrap().snapshot_format_range(range("C3", "D6")), raw);
        assert_eq!(wb.sheet(0).unwrap().get_formula("D5").as_deref(), Some("=D4+1"));
        history.redo(&mut wb).unwrap();
        assert_eq!(wb.snapshot_display_format_range(0, range("C3", "D6")).unwrap(), display_before);
        assert_eq!(wb.get_cell("Sheet1", "F1"), Value::Number(21.));
    }
}

#[test]
fn oversized_conversion_rejects_atomically_without_losing_redo() {
    let (mut wb, mut history) = seed();
    history.resize_table(&mut wb, "Orders", range("C3", "D1048576")).unwrap();
    history.set_table_style(&mut wb, "Orders", blue()).unwrap();
    history.set_cell_input(&mut wb, 0, "D4", "20").unwrap();
    history.undo(&mut wb).unwrap();
    assert!(history.convert_table_to_range(&mut wb, "Orders").unwrap_err().contains("undo budget"));
    assert_eq!(wb.get_table("Orders").unwrap().style(), blue());
    assert_eq!(history.redo_count(), 1);
    // 读小窗口不按 Table 的百万行范围展开。
    assert_eq!(wb.snapshot_display_format_range(0, range("C3", "D4")).unwrap().formats.cell_styles.len(), 4);
    history.redo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "D4"), Value::Number(20.));
}

#[test]
fn clipboard_freezes_table_style_without_baking_conditional_formatting() {
    let (mut wb, mut history) = seed();
    history.set_table_style(&mut wb, "Orders", blue()).unwrap();
    wb.set_conditional_format_rule(0, 0, rule("r", range("D4", "D4"), "gt", "5")).unwrap();
    let clipboard = wb.capture_clipboard(0, range("C3", "D6"), false).unwrap();
    history.set_table_style(&mut wb, "Orders", TableStyle::default()).unwrap();
    wb.paste_clipboard(&clipboard, 0, &ClipboardPasteOptions::new(range("G3", "G3"))).unwrap();
    assert_eq!(wb.sheet(0).unwrap().get_format("G3").background.as_deref(), Some("#1f4e78"));
    assert_eq!(wb.sheet(0).unwrap().get_format("H4").background.as_deref(), Some("#d9e8f5"));
    assert_eq!(wb.get_cell("Sheet1", "H4"), Value::Number(10.));
    assert_eq!(wb.table_count(), 1);
}
