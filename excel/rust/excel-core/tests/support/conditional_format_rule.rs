use einfach_excel_core::workbook::ConditionalFormatRuleEntry;
use einfach_excel_core::{CellAddress, CellRange};

pub fn range(start: &str, end: &str) -> CellRange {
    CellRange::new(
        CellAddress::parse(start).unwrap(),
        CellAddress::parse(end).unwrap(),
    )
}

pub fn rule(
    id: &str,
    bounds: CellRange,
    operator: &str,
    value: &str,
) -> ConditionalFormatRuleEntry {
    ConditionalFormatRuleEntry {
        id: id.to_owned(),
        row_start: bounds.start.row,
        row_end: bounds.end.row,
        col_start: bounds.start.col,
        col_end: bounds.end.col,
        priority: 0,
        rule_json: serde_json::json!({ "kind": "cell-value", "operator": operator,
            "value": value, "format": { "background": "#FFC7CE" } })
        .to_string(),
    }
}
