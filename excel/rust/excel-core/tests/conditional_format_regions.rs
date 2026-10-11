//! 离散范围共用统计，空洞排除；首区提供公式原点，结构历史同步所有区域。
#[path = "support/conditional_format_rule.rs"]
mod support;
use einfach_core::Value;
use einfach_excel_core::workbook::ConditionalFormatRuleEntry;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::shift::ShiftEdit;
use einfach_excel_core::{CellStyle, Workbook};
use support::{range, rule};

fn entry(kind: serde_json::Value) -> ConditionalFormatRuleEntry {
    let mut entry = rule("one-rule", range("A1", "A2"), "gt", "0");
    entry.additional_ranges = vec![range("C1", "C2")];
    entry.rule_json = kind.to_string();
    entry
}
fn style(book: &Workbook, address: &str) -> CellStyle {
    book.snapshot_display_format_range(0, range(address, address)).unwrap().formats.cell_styles
        .into_iter().next().map(|(_, style)| style).unwrap_or_default()
}

#[test]
fn statistics_read_all_regions_but_not_bounding_box_holes() {
    let mut book = Workbook::new();
    for (address, value) in [("A1", 0.), ("A2", 50.), ("C1", 100.), ("C2", 200.), ("B1", -999.)] {
        book.set_cell(0, address, Value::Number(value));
    }
    let mut history = WorkbookHistory::default();
    history.set_conditional_format_rule(&mut book, 0, 0, entry(serde_json::json!({
        "kind":"color-scale", "minColor":"#000000", "maxColor":"#ffffff"}))).unwrap();
    assert_eq!(style(&book, "A2").background, Some(Some("#404040".into())));
    assert_eq!(style(&book, "C1").background, Some(Some("#808080".into())));
    assert_eq!(style(&book, "B1").background, None);
    let reads = book.sheet(0).unwrap().debug_recompute_count();
    style(&book, "C2");
    book.set_cell(0, "B1", Value::Number(-9999.));
    style(&book, "A2");
    assert_eq!(book.sheet(0).unwrap().debug_recompute_count(), reads);
    book.set_cell(0, "C2", Value::Number(100.));
    assert_eq!(style(&book, "A2").background, Some(Some("#808080".into())));
    history.undo(&mut book).unwrap();
    assert_eq!(style(&book, "C1").background, None);
    history.redo(&mut book).unwrap();
    assert_eq!(style(&book, "A2").background, Some(Some("#808080".into())));
    assert_eq!(book.conditional_format_config(0).unwrap().rules.len(), 1);
}

#[test]
fn duplicate_and_disable_keep_every_region_and_one_shared_rank_domain() {
    use einfach_excel_core::workbook::ConditionalFormatRuleAction::*;
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Number(5.));
    book.set_cell(0, "C1", Value::Number(10.));
    book.set_conditional_format_rule(0, 0, entry(serde_json::json!({
        "kind":"top-bottom", "direction":"top", "count":1, "format":{"bold":true}}))).unwrap();
    assert_ne!(style(&book, "A1").bold, Some(true));
    assert_eq!(style(&book, "C1").bold, Some(true));
    let mut history = WorkbookHistory::default();
    history.manage_conditional_format_rule(&mut book, 0, 1, "one-rule", Duplicate).unwrap();
    let config = book.conditional_format_config(0).unwrap();
    assert_eq!(config.rules[0].additional_ranges, config.rules[1].additional_ranges);
    history.undo(&mut book).unwrap();
    let revision = book.conditional_format_config(0).unwrap().revision;
    history.manage_conditional_format_rule(&mut book, 0, revision, "one-rule", Disable).unwrap();
    assert_ne!(style(&book, "C1").bold, Some(true));
    history.undo(&mut book).unwrap();
    assert_eq!(style(&book, "C1").bold, Some(true));
}

#[test]
fn deleting_first_area_rebases_formula_to_surviving_area() {
    let mut book = Workbook::new();
    book.set_cell(0, "D5", Value::Number(9.));
    let mut rule = entry(serde_json::json!({"kind":"formula", "formula":"=B1>5", "format":{"bold":true}}));
    rule.additional_ranges = vec![range("C5", "C6")];
    book.set_conditional_format_rule(0, 0, rule.clone()).unwrap();
    assert_eq!(style(&book, "C5").bold, Some(true));
    let mut history = WorkbookHistory::default();
    history.edit_structure(&mut book, 0, ShiftEdit::RowDelete { at: 0, count: 2 }).unwrap();
    let after = book.conditional_format_config(0).unwrap().rules.remove(0);
    assert_eq!(after.ranges().collect::<Vec<_>>(), vec![range("C3", "C4")]);
    assert!(after.rule_json.contains("D3"));
    assert_eq!(style(&book, "C3").bold, Some(true));
    history.undo(&mut book).unwrap();
    assert_eq!(book.conditional_format_config(0).unwrap().rules, vec![rule]);
    assert_eq!(style(&book, "C5").bold, Some(true));
}

#[test]
fn invalid_or_overlapping_regions_reject_before_mutation() {
    let mut book = Workbook::new();
    for areas in [vec![range("A2", "B3")], vec![range("D4", "C3")],
        vec![range("A1048577", "A1048577")], vec![range("C1", "C1"); 4096]] {
        let mut invalid = entry(serde_json::json!({"kind":"data-bar"}));
        invalid.additional_ranges = areas;
        assert!(book.set_conditional_format_rule(0, 0, invalid).is_err());
        assert!(book.snapshot_conditional_formats().is_empty());
    }
}
