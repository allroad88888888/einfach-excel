use super::*;
use einfach_excel_core::{CellAddress, CellRange, ColumnFilterRule};
use einfach_excel_core::data_validation::{DataValidationKind, DataValidationRule};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::workbook::ConditionalFormatRuleEntry;

fn range(a: &str, b: &str) -> CellRange {
    CellRange::new(CellAddress::parse(a).unwrap(), CellAddress::parse(b).unwrap())
}

#[test]
fn busy_and_error_validation_dependencies_reject_until_the_original_formula_settles() {
    let mut book = book();
    book.set_formula(0, "A1", "=FETCHJSON(1)");
    let rule = DataValidationRule {
        kind: DataValidationKind::CustomFormula { formula: "=$A$1>0".into(),
            anchor: CellAddress::parse("B1").unwrap() },
        ignore_blank: false, operator: Default::default(), options: Default::default(),
    };
    book.sheet_mut(0).unwrap().set_data_validation(range("B1", "B1"), Some(rule)).unwrap();
    assert!(book.set_cell_input(0, "B1", "2").is_err());
    let call = book.take_pending_async_custom_calls()[0].call_id;
    book.resolve_async_custom_call(call, failed()).unwrap();
    assert!(book.set_cell_input(0, "B1", "2").is_err());
    book.recalculate(None).unwrap();
    let retry = book.take_pending_async_custom_calls()[0].call_id;
    book.resolve_async_custom_call(retry, Value::Number(3.0)).unwrap();
    book.set_cell_input(0, "B1", "2").unwrap();
    assert_eq!(book.get_cell("Sheet1", "B1"), Value::Number(2.0));
}

#[test]
fn filter_keeps_explicit_snapshot_until_reapply_after_busy_settlement() {
    let mut book = book();
    book.set_cell(0, "A1", Value::Text("Value".into()));
    book.set_formula(0, "A2", "=FETCHJSON(1)");
    book.set_cell(0, "A3", Value::Number(9.0));
    let rules = [ColumnFilterRule::Range { col_index: 0, min: Some(1.0), max: Some(5.0) }];
    book.apply_filter_range(0, range("A1", "A3"), &rules).unwrap();
    assert_eq!(book.filter_hidden_rows(0), vec![1, 2]);
    let call = book.take_pending_async_custom_calls()[0].call_id;
    book.resolve_async_custom_call(call, Value::Number(3.0)).unwrap();
    assert_eq!(book.filter_hidden_rows(0), vec![1, 2]);
    assert_eq!(book.reapply_filter(0).unwrap().hidden_rows, vec![2]);
}

#[test]
fn conditional_formula_treats_busy_and_error_as_false_and_reacts_to_settled_result() {
    let mut book = book();
    book.set_formula(0, "A1", "=FETCHJSON(1)");
    let rule = ConditionalFormatRuleEntry {
        id: "async-positive".into(), row_start: 0, row_end: 0, col_start: 1, col_end: 1,
        additional_ranges: vec![], priority: 0,
        rule_json: serde_json::json!({"kind":"formula", "formula":"=$A$1>0",
            "format":{"bold":true}}).to_string(),
    };
    WorkbookHistory::default().set_conditional_format_rule(&mut book, 0, 0, rule).unwrap();
    let bold = |book: &Workbook| book.snapshot_display_format_range(0, range("B1", "B1"))
        .unwrap().formats.cell_styles.iter().any(|(_, style)| style.bold == Some(true));
    assert!(!bold(&book));
    let call = book.take_pending_async_custom_calls()[0].call_id;
    book.resolve_async_custom_call(call, failed()).unwrap();
    assert!(!bold(&book));
    book.recalculate(None).unwrap();
    let retry = book.take_pending_async_custom_calls()[0].call_id;
    book.resolve_async_custom_call(retry, Value::Number(4.0)).unwrap();
    assert!(bold(&book));
}
