use super::*;
use einfach_excel_core::{CellAddress, CellRange};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::protection::ProtectionChange;

#[test]
fn changed_arguments_and_overwritten_formula_ignore_old_result_without_cell_writes() {
    let mut book = book();
    book.set_cell(0, "B1", Value::Number(1.0));
    book.set_formula(0, "A1", "=FETCHJSON(B1)");
    let old = book.take_pending_async_custom_calls()[0].call_id;
    book.set_cell(0, "B1", Value::Number(2.0));
    assert_eq!(book.get_cell("Sheet1", "A1"), busy());
    let new = book.take_pending_async_custom_calls()[0].call_id;
    book.resolve_async_custom_call(old, Value::Number(99.0)).unwrap();
    assert_eq!(book.get_cell("Sheet1", "A1"), busy());
    book.resolve_async_custom_call(new, Value::Number(8.0)).unwrap();
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(8.0));
    book.set_cell_input(0, "A1", "keep").unwrap();
    assert!(!book.resolve_async_custom_call(new, Value::Number(999.0)).unwrap());
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Text("keep".into()));
}

#[test]
fn async_settle_under_protection_preserves_formula_and_original_undo_redo_transaction() {
    let mut book = book();
    let mut history = WorkbookHistory::default();
    let range = CellRange::single(CellAddress::new(0, 0));
    book.set_cell_input(0, "A1", "before").unwrap();
    history.begin(&book, 0, range, "Edit formula", true).unwrap();
    book.set_cell_input(0, "A1", "=FETCHJSON(1)").unwrap();
    history.finish(&mut book, true).unwrap();
    let call = book.take_pending_async_custom_calls()[0].call_id;
    book.change_protection(0, ProtectionChange::Protect).unwrap();
    book.resolve_async_custom_call(call, Value::Number(7.0)).unwrap();
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(7.0));
    assert_eq!(book.sheet(0).unwrap().get_formula("A1").as_deref(), Some("=FETCHJSON(1)"));
    assert_eq!(history.undo_count(), 1);
    book.recalculate(None).unwrap();
    assert!(book.take_pending_async_custom_calls().is_empty());
    assert_eq!(history.undo_count(), 1);
    book.change_protection(0, ProtectionChange::Unprotect).unwrap();
    history.undo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Text("before".into()));
    history.redo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(7.0));
}

#[test]
fn restored_formula_name_cache_is_invalidated_when_trusted_application_registry_is_installed() {
    let mut book = Workbook::new();
    book.set_formula(0, "A1", "=FETCHJSON(1)");
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Error(ValueError::InvalidName));
    book.set_custom_function_registry(Some(Arc::new(FetchJson)));
    book.invalidate_all_formulas_for_custom_function_change();
    assert_eq!(book.get_cell("Sheet1", "A1"), busy());
    let call = book.take_pending_async_custom_calls()[0].call_id;
    book.resolve_async_custom_call(call, Value::Number(4.0)).unwrap();
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(4.0));
}

#[test]
fn registered_async_host_name_rejects_user_definition_without_rewriting_memo_or_history() {
    use einfach_excel_core::custom_formulas::{CustomFormulaAction, CustomFormulaDefinition};
    let mut book = book();
    let mut history = WorkbookHistory::default();
    book.set_formula(0, "A1", "=FETCHJSON(1)");
    let before = book.take_pending_async_custom_calls();
    assert!(history.change_custom_formula(&mut book, 0, CustomFormulaAction::Upsert {
        definition: CustomFormulaDefinition {
            name: "fetchjson".into(), parameters: vec!["url".into()], expression: "=999".into(),
        },
    }).unwrap_err().contains("already in use"));
    assert!(book.custom_formula_definitions().is_empty());
    assert_eq!(history.undo_count(), 0);
    book.resolve_async_custom_call(before[0].call_id, Value::Number(4.0)).unwrap();
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(4.0));
}
