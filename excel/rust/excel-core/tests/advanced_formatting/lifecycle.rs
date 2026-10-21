use super::*;
use einfach_excel_core::{CellFormat, CellStyle, CustomFunctionRegistry, NumberFormat, StyleScope};
use einfach_excel_core::shift::ShiftEdit;
use einfach_excel_core::workbook::ConditionalFormatRuleAction::{Disable, Duplicate, Enable};
use std::sync::Arc;

#[test]
fn base_format_undo_redo_and_file_snapshot_recompute_display_duplicates() {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Number(0.5));
    book.set_cell(0, "A2", Value::Text("50%".into()));
    install(&mut book, display("duplicate"));
    assert!(!bold(&book, "A1"));
    let mut history = WorkbookHistory::default();
    history.patch_format_selection(&mut book, 0, &[(range("A1", "A1"), StyleScope::Cell)],
        CellStyle { number_format: Some(NumberFormat::Percent { digits: 0 }), ..Default::default() }).unwrap();
    assert!(bold(&book, "A1")); assert_eq!(history.undo_count(), 1);
    history.undo(&mut book).unwrap(); assert!(!bold(&book, "A1"));
    history.redo(&mut book).unwrap(); assert!(bold(&book, "A1"));
    let rules = book.snapshot_conditional_formats();
    let formats = book.sheet(0).unwrap().snapshot_format_range(range("A1", "A2"));
    let mut restored = Workbook::new();
    restored.set_cell(0, "A1", Value::Number(0.5)); restored.set_cell(0, "A2", Value::Text("50%".into()));
    restored.sheet_mut(0).unwrap().restore_format_range_snapshot(formats);
    restored.restore_conditional_formats(rules).unwrap();
    assert!(bold(&restored, "A1"));
    restored.sheet_mut(0).unwrap().set_format("A1", CellFormat::default());
    assert!(!bold(&restored, "A1"));
}

#[test]
fn replacing_and_removing_display_rules_release_both_owned_statistics_atoms() {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Number(1.0)); book.set_cell(0, "A2", Value::Text("1".into()));
    install(&mut book, display("duplicate")); assert!(bold(&book, "A1"));
    let warm = book.sheet(0).unwrap().debug_total_atom_count();
    install(&mut book, text("matches-wildcard", "1"));
    assert_eq!(book.sheet(0).unwrap().debug_total_atom_count(), warm - 2);
    install(&mut book, display("duplicate")); assert!(bold(&book, "A1"));
    assert_eq!(book.sheet(0).unwrap().debug_total_atom_count(), warm);
    let revision = book.conditional_format_config(0).unwrap().revision;
    book.remove_conditional_format_rule(0, revision, "advanced").unwrap();
    assert_eq!(book.sheet(0).unwrap().debug_total_atom_count(), warm - 2);
}

#[test]
fn wildcard_and_display_rules_reuse_enable_copy_structure_history_and_priority_stop() {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Text("abc".into())); book.set_cell(0, "A2", Value::Text("ABC".into()));
    let mut upper = entry(text("matches-wildcard", "a*")); upper.row_end = 1;
    let mut json: serde_json::Value = serde_json::from_str(&upper.rule_json).unwrap();
    json["stopIfTrue"] = json!(true); upper.rule_json = json.to_string();
    book.set_conditional_format_rule(0, 0, upper).unwrap();
    let mut lower = entry(display("duplicate")); lower.id = "lower".into(); lower.priority = 1;
    let mut json: serde_json::Value = serde_json::from_str(&lower.rule_json).unwrap();
    json["format"] = json!({"italic":true}); lower.rule_json = json.to_string();
    book.set_conditional_format_rule(0, 1, lower).unwrap();
    let view = book.snapshot_display_format_range(0, range("A1", "A1")).unwrap();
    assert_eq!(view.formats.cell_styles[0].1.bold, Some(true));
    assert_eq!(view.formats.cell_styles[0].1.italic, None);
    let mut history = WorkbookHistory::default();
    for action in [Disable, Duplicate, Enable] {
        let revision = book.conditional_format_config(0).unwrap().revision;
        history.manage_conditional_format_rule(&mut book, 0, revision, "advanced", action).unwrap();
    }
    assert!(bold(&book, "A1"));
    history.edit_structure(&mut book, 0, ShiftEdit::RowInsert { at: 0, count: 1 }).unwrap();
    assert!(bold(&book, "A2"));
    assert_eq!(book.conditional_format_config(0).unwrap().rules[0].row_start, 1);
    history.undo(&mut book).unwrap(); assert!(bold(&book, "A1"));
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Text("abc".into()));
}

#[derive(Debug)]
struct AsyncNumber;
impl CustomFunctionRegistry for AsyncNumber {
    fn lookup(&self, _: &str, _: &[Value]) -> Option<Value> { None }
    fn contains(&self, name: &str) -> bool { name == "ASYNCNUMBER" }
    fn is_async(&self, name: &str) -> bool { name == "ASYNCNUMBER" }
}

#[test]
fn async_formula_settlement_invalidates_native_display_keys_without_a_value_edit() {
    let mut book = Workbook::new();
    book.set_custom_function_registry(Some(Arc::new(AsyncNumber)));
    book.set_cell(0, "A1", Value::Text("50%".into()));
    book.set_formula(0, "A900000", "=ASYNCNUMBER(1)");
    book.sheet_mut(0).unwrap().set_format("A900000", CellFormat {
        number_format: NumberFormat::Percent { digits: 0 }, ..Default::default() });
    install(&mut book, display("duplicate")); assert!(!bold(&book, "A1"));
    let calls = book.take_pending_async_custom_calls(); assert_eq!(calls.len(), 1);
    book.resolve_async_custom_call(calls[0].call_id, Value::Number(0.5)).unwrap();
    assert!(bold(&book, "A1")); assert!(bold(&book, "A900000"));
}
