use einfach_core::{ArrayData, Value, ValueError};
use einfach_excel_core::{CustomFunctionRegistry, Workbook};
use std::sync::Arc;

#[path = "async_formulas/history.rs"]
mod history;
#[path = "async_formulas/semantics.rs"]
mod semantics;

#[derive(Debug)]
struct FetchJson;
impl CustomFunctionRegistry for FetchJson {
    fn lookup(&self, _: &str, _: &[Value]) -> Option<Value> { None }
    fn contains(&self, name: &str) -> bool { name == "FETCHJSON" }
    fn is_async(&self, name: &str) -> bool { name == "FETCHJSON" }
}
fn book() -> Workbook {
    let mut book = Workbook::new();
    book.set_custom_function_registry(Some(Arc::new(FetchJson)));
    book
}
fn busy() -> Value { Value::Error(ValueError::Busy) }
fn failed() -> Value { Value::Error(ValueError::NotAvailable) }

#[test]
fn selected_sheet_retries_failed_memo_without_restarting_success_inflight_or_unrelated_sheet() {
    let mut book = book();
    book.add_sheet("Other");
    for (sheet, address, value) in [(0, "A1", 1), (0, "B1", 2), (0, "C1", 3), (1, "A1", 4)] {
        book.set_formula(sheet, address, &format!("=FETCHJSON({value})"));
    }
    let calls = book.take_pending_async_custom_calls();
    assert_eq!(calls.len(), 4);
    for call in &calls {
        if call.args == vec![Value::Number(1.0)] || call.args == vec![Value::Number(4.0)] {
            book.resolve_async_custom_call(call.call_id, failed()).unwrap();
        } else if call.args == vec![Value::Number(2.0)] {
            book.resolve_async_custom_call(call.call_id, Value::Number(12.0)).unwrap();
        }
    }
    book.recalculate(Some(0)).unwrap();
    let retry = book.take_pending_async_custom_calls();
    assert_eq!(retry.len(), 1);
    assert_eq!(retry[0].args, vec![Value::Number(1.0)]);
    assert_eq!(book.get_cell("Other", "A1"), failed());
    assert_eq!(book.get_cell("Sheet1", "B1"), Value::Number(12.0));
    assert_eq!(book.get_cell("Sheet1", "C1"), busy());
    book.resolve_async_custom_call(retry[0].call_id, Value::Number(20.0)).unwrap();
    book.recalculate(None).unwrap();
    let retry_other = book.take_pending_async_custom_calls();
    assert_eq!(retry_other.len(), 1);
    assert_eq!(retry_other[0].args, vec![Value::Number(4.0)]);
}

#[test]
fn shared_failed_memo_retries_once_and_recovers_cross_sheet_observers() {
    let mut book = book();
    book.add_sheet("Other");
    book.set_formula(0, "A1", "=FETCHJSON(1)");
    book.set_formula(1, "A1", "=FETCHJSON(1)");
    book.set_formula(1, "B1", "=Sheet1!A1+1");
    let calls = book.take_pending_async_custom_calls();
    assert_eq!(calls.len(), 1);
    book.resolve_async_custom_call(calls[0].call_id, failed()).unwrap();
    assert_eq!(book.get_cell("Other", "B1"), failed());
    book.recalculate(Some(1)).unwrap();
    let retry = book.take_pending_async_custom_calls();
    assert_eq!(retry.len(), 1);
    assert_ne!(calls[0].call_id, retry[0].call_id);
    assert!(!book.resolve_async_custom_call(calls[0].call_id, Value::Number(99.0)).unwrap());
    book.resolve_async_custom_call(retry[0].call_id, Value::Number(7.0)).unwrap();
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(7.0));
    assert_eq!(book.get_cell("Other", "A1"), Value::Number(7.0));
    assert_eq!(book.get_cell("Other", "B1"), Value::Number(8.0));
    assert!(book.take_pending_async_custom_calls().is_empty());
}

#[test]
fn true_async_array_settlement_projects_spills_and_cross_sheet_dependents() {
    let mut book = book();
    book.add_sheet("Other");
    book.set_formula(0, "A1", "=FETCHJSON(1)");
    book.set_formula(0, "D1", "=SUM(A1#)");
    book.set_formula(1, "A1", "=Sheet1!A1#*10");
    assert_eq!(book.get_cell("Other", "A1"), busy());
    let calls = book.take_pending_async_custom_calls();
    book.resolve_async_custom_call(calls[0].call_id,
        Value::Array(Arc::new(ArrayData::new(2, 2, vec![
            Value::Number(1.0), Value::Number(2.0), Value::Number(3.0), Value::Number(4.0),
        ])))).unwrap();
    assert_eq!(book.get_cell("Sheet1", "B2"), Value::Number(4.0));
    assert_eq!(book.get_cell("Sheet1", "D1"), Value::Number(10.0));
    assert_eq!(book.get_cell("Other", "B2"), Value::Number(40.0));
}
