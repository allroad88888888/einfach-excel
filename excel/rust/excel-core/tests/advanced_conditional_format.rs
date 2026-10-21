//! Advanced visual rule integration through the production workbook/history path.
use einfach_core::Value;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, ConditionalFormatRuleEntry, Workbook};

#[path = "advanced_conditional_format/thresholds.rs"]
mod thresholds;
#[path = "advanced_conditional_format/icons.rs"]
mod icons;
#[path = "advanced_conditional_format/history_structure.rs"]
mod history_structure;

fn range(start: &str, end: &str) -> CellRange {
    CellRange::new(CellAddress::parse(start).unwrap(), CellAddress::parse(end).unwrap())
}

fn entry(id: &str, json: serde_json::Value, priority: i64) -> ConditionalFormatRuleEntry {
    ConditionalFormatRuleEntry { id: id.into(), row_start: 0, row_end: 999, col_start: 0, col_end: 0,
        additional_ranges: Vec::new(), priority, rule_json: json.to_string() }
}

fn install(book: &mut Workbook, json: serde_json::Value) {
    let revision = book.conditional_format_config(0).unwrap().revision;
    WorkbookHistory::default().set_conditional_format_rule(book, 0, revision, entry("visual", json, 0)).unwrap();
}

fn numbers() -> Workbook {
    let mut book = Workbook::new();
    for (address, value) in [("A1", 0.0), ("A2", 10.0), ("A1000", 100.0)] {
        book.set_cell(0, address, Value::Number(value));
    }
    book
}

fn color(book: &Workbook, address: &str) -> Option<String> {
    book.snapshot_display_format_range(0, range(address, address)).unwrap().formats.cell_styles
        .into_iter().find_map(|(_, style)| style.background.flatten())
}

fn scale(max: serde_json::Value) -> serde_json::Value {
    serde_json::json!({"kind":"color-scale", "minColor":"#000000", "maxColor":"#ffffff", "maxThreshold":max})
}
