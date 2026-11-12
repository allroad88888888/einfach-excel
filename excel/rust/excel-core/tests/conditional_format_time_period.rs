#[path = "support/conditional_format_rule.rs"]
mod support;
use einfach_core::Value;
use einfach_excel_core::{CellAddress, Workbook};
use einfach_excel_core::workbook_history::WorkbookHistory;
use serde_json::json;
use support::{range, rule};

#[test]
fn date_projection_keeps_scalars_formulas_base_styles_and_history() {
    let mut book = Workbook::new();
    book.set_formula(0, "A1", "=TODAY()");
    book.set_formula(0, "A2", "=TODAY()+0.75");
    book.set_formula(0, "A3", "=TODAY()-1");
    book.set_cell(0, "A4", Value::Text("2026-11-12".into()));
    book.set_cell(0, "A5", Value::Boolean(true));
    book.set_formula(0, "A6", "=1/0");
    book.set_formula(0, "C1", "=TODAY()");
    let bounds = range("A1", "A7");
    let before = book.snapshot_display_format_range(0, bounds).unwrap();
    let mut entry = rule("date", bounds, "gt", "0");
    entry.rule_json = json!({"kind":"time-period", "period":"today",
        "stopIfTrue":true, "format":{"bgColor":"#ffc7ce"}}).to_string();
    let mut history = WorkbookHistory::default();
    history.set_conditional_format_rule(&mut book, 0, 0, entry).unwrap();
    let display = book.snapshot_display_format_range(0, range("A1", "C7")).unwrap();
    let addresses: Vec<_> = display.formats.cell_styles.iter().map(|(addr, _)| *addr).collect();
    assert_eq!(addresses, vec![CellAddress::new(0, 0), CellAddress::new(1, 0)]);
    assert!(book.sheet(0).unwrap().snapshot_format_range(bounds).cell_styles.is_empty());
    history.undo(&mut book).unwrap();
    assert_eq!(book.snapshot_display_format_range(0, bounds).unwrap(), before);
    history.redo(&mut book).unwrap();
    assert_eq!(book.snapshot_display_format_range(0, range("A1", "C7")).unwrap(), display);
}

#[test]
fn invalid_date_rule_does_not_change_catalog_revision_or_history() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    let before = book.conditional_format_config(0).unwrap().clone();
    for invalid in [json!("nextYear"), json!(null), json!(false)] {
        let mut entry = rule("bad", range("A1", "A2"), "gt", "0");
        entry.rule_json = json!({"kind":"time-period", "period":invalid,
            "format":{"bold":true}}).to_string();
        assert!(history.set_conditional_format_rule(&mut book, 0, 0, entry).is_err());
        assert_eq!(book.conditional_format_config(0).unwrap(), before);
    }
    assert!(!history.undo(&mut book).unwrap());
}
