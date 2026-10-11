//! 真正失效缓存的证据：宿主值变化不发送写入，只有手动重算才能读到新值。
use einfach_core::{Value, ValueError};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, CustomFunctionRegistry, Workbook};
use std::collections::HashMap;
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc,
};

#[derive(Debug, Default)]
struct ExternalValue {
    value: AtomicUsize,
    calls: AtomicUsize,
}
impl CustomFunctionRegistry for ExternalValue {
    fn lookup(&self, name: &str, _: &[Value]) -> Option<Value> {
        if name != "EXTERNAL" {
            return None;
        }
        self.calls.fetch_add(1, Ordering::SeqCst);
        Some(Value::Number(self.value.load(Ordering::SeqCst) as f64))
    }
    fn is_async(&self, name: &str) -> bool {
        name == "SLOW"
    }
}
fn book() -> (Workbook, Arc<ExternalValue>) {
    let mut book = Workbook::new();
    let value = Arc::new(ExternalValue::default());
    value.value.store(2, Ordering::SeqCst);
    book.set_custom_function_registry(Some(value.clone()));
    (book, value)
}

#[test]
fn sheet_recalculation_refreshes_cross_sheet_dependents_not_unrelated_formulas() {
    let (mut book, value) = book();
    book.add_sheet("Other");
    book.set_formula(0, "A1", "=EXTERNAL()");
    book.set_formula(0, "B1", "=A1*2");
    book.set_formula(1, "A1", "=EXTERNAL()");
    book.set_formula(1, "B1", "=Sheet1!B1+1");
    assert_eq!(book.get_cell("Other", "A1"), Value::Number(2.0));
    assert_eq!(book.get_cell("Other", "B1"), Value::Number(5.0));
    let calls = value.calls.load(Ordering::SeqCst);
    value.value.store(7, Ordering::SeqCst);
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(2.0));
    assert_eq!(book.recalculate(Some(0)), Ok(2));
    assert_eq!(book.get_cell("Other", "B1"), Value::Number(15.0));
    assert_eq!(book.get_cell("Other", "A1"), Value::Number(2.0));
    assert_eq!(value.calls.load(Ordering::SeqCst), calls + 1);
    assert_eq!(book.recalculate(None), Ok(4));
    assert_eq!(book.get_cell("Other", "A1"), Value::Number(7.0));
    assert_eq!(value.calls.load(Ordering::SeqCst), calls + 3);
}

#[test]
fn empty_invalid_and_error_formulas_do_not_create_content_or_history() {
    let (mut book, _) = book();
    assert_eq!(book.recalculate(None), Ok(0));
    assert_eq!(book.debug_total_atom_count(0), 0);
    assert!(book.recalculate(Some(9)).is_err());
    let mut history = WorkbookHistory::default();
    let range = CellRange::single(CellAddress::new(0, 0));
    history.begin(&book, 0, range, "Edit A1", true).unwrap();
    book.set_cell_input(0, "A1", "=1/0").unwrap();
    history.finish(&mut book, true).unwrap();
    assert_eq!(book.recalculate(None), Ok(1));
    assert_eq!(
        book.get_cell("Sheet1", "A1"),
        Value::Error(ValueError::DivisionByZero)
    );
    assert_eq!(history.undo_count(), 1);
    history.undo(&mut book).unwrap();
    assert_eq!(book.recalculate(None), Ok(0));
    assert_eq!(history.redo_count(), 1);
    history.redo(&mut book).unwrap();
    assert_eq!(
        book.sheet(0).unwrap().get_formula("A1").as_deref(),
        Some("=1/0")
    );
}

#[test]
fn recalculate_hydrates_offscreen_imported_formulas_without_scanning_empty_cells() {
    let (mut book, value) = book();
    book.install_sheet_bulk(
        0,
        HashMap::new(),
        HashMap::from([(
            CellAddress::parse("XFD1048576").unwrap(),
            "=EXTERNAL()+1".to_owned(),
        )]),
    )
    .unwrap();
    value.value.store(10, Ordering::SeqCst);
    assert_eq!(book.recalculate(Some(0)), Ok(1));
    assert_eq!(book.get_cell("Sheet1", "XFD1048576"), Value::Number(11.0));
    assert!(book.debug_total_atom_count(0) < 30);
}

#[test]
fn resized_arrays_and_cross_sheet_spill_consumers_use_dependency_order() {
    let (mut book, value) = book();
    book.add_sheet("Source");
    book.set_formula(1, "A1", "=SEQUENCE(EXTERNAL())");
    book.set_formula(0, "A1", "=Source!A1#*10");
    book.set_formula(0, "D1", "=SUM(A1#)");
    assert_eq!(book.get_cell("Sheet1", "A2"), Value::Number(20.0));
    for (size, sum) in [(4, 100.0), (1, 10.0), (3, 60.0)] {
        value.value.store(size, Ordering::SeqCst);
        assert_eq!(book.recalculate(Some(1)), Ok(1));
        assert_eq!(book.get_cell("Sheet1", "D1"), Value::Number(sum));
        let last = book.get_cell("Sheet1", &format!("A{size}"));
        let last = if let Value::Array(array) = last {
            array.get(0, 0).unwrap().clone()
        } else {
            last
        };
        assert_eq!(last, Value::Number(size as f64 * 10.0));
        assert_eq!(
            book.get_cell("Sheet1", &format!("A{}", size + 1)),
            Value::Null
        );
    }
    value.value.store(4, Ordering::SeqCst);
    assert_eq!(book.recalculate(None), Ok(3));
    assert_eq!(book.get_cell("Sheet1", "D1"), Value::Number(100.0));
}

#[test]
fn async_calls_keep_their_inflight_and_settled_memo_during_manual_recalculation() {
    let (mut book, _) = book();
    book.set_formula(0, "A1", "=SLOW(1)");
    book.set_formula(0, "B1", "=A1+1");
    let calls = book.take_pending_async_custom_calls();
    assert_eq!(calls.len(), 1);
    assert_eq!(book.recalculate(None), Ok(2));
    assert!(book.take_pending_async_custom_calls().is_empty());
    assert_eq!(
        book.get_cell("Sheet1", "B1"),
        Value::Error(ValueError::Busy)
    );
    book.resolve_async_custom_call(calls[0].call_id, Value::Number(12.0))
        .unwrap();
    assert_eq!(book.recalculate(None), Ok(2));
    assert_eq!(book.get_cell("Sheet1", "B1"), Value::Number(13.0));
    assert!(book.take_pending_async_custom_calls().is_empty());
}

#[test]
fn shrinking_blocked_spill_clears_error_without_overwriting_the_obstruction() {
    let (mut book, value) = book();
    book.set_cell(0, "A3", Value::Text("keep".into()));
    book.set_formula(0, "A1", "=SEQUENCE(EXTERNAL())");
    value.value.store(4, Ordering::SeqCst);
    book.recalculate(None).unwrap();
    assert_eq!(
        book.get_cell("Sheet1", "A1"),
        Value::Error(ValueError::Spill)
    );
    value.value.store(2, Ordering::SeqCst);
    book.recalculate(None).unwrap();
    assert_eq!(book.get_cell("Sheet1", "A2"), Value::Number(2.0));
    assert_eq!(book.get_cell("Sheet1", "A3"), Value::Text("keep".into()));
}
