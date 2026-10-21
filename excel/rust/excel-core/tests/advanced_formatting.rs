//! Text/display semantics through the real workbook conditional-format pipeline.
use einfach_core::Value;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, ConditionalFormatRuleEntry, Workbook};
use serde_json::json;

#[path = "advanced_formatting/wildcard.rs"]
mod wildcard;
#[path = "advanced_formatting/display_text.rs"]
mod display_text;
#[path = "advanced_formatting/lifecycle.rs"]
mod lifecycle;

fn range(start: &str, end: &str) -> CellRange {
    CellRange::new(CellAddress::parse(start).unwrap(), CellAddress::parse(end).unwrap())
}
fn entry(json: serde_json::Value) -> ConditionalFormatRuleEntry {
    ConditionalFormatRuleEntry { id: "advanced".into(), row_start: 0, row_end: 1_048_575,
        col_start: 0, col_end: 0, additional_ranges: Vec::new(), priority: 0,
        rule_json: json.to_string() }
}
fn install(book: &mut Workbook, json: serde_json::Value) {
    let revision = book.conditional_format_config(0).unwrap().revision;
    WorkbookHistory::default().set_conditional_format_rule(book, 0, revision, entry(json)).unwrap();
}
fn bold(book: &Workbook, address: &str) -> bool {
    book.snapshot_display_format_range(0, range(address, address)).unwrap().formats.cell_styles
        .iter().any(|(_, style)| style.bold == Some(true))
}
fn text(condition: &str, text: &str) -> serde_json::Value {
    json!({"kind":"text","condition":condition,"text":text,"format":{"bold":true}})
}
fn display(mode: &str) -> serde_json::Value {
    json!({"kind":"duplicate-values","mode":mode,"compareBy":"display-text","format":{"bold":true}})
}
