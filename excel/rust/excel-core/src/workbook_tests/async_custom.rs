//! Workbook async custom-function tests.

use super::*;
use einfach_core::ValueError;

/// Shared registry for the async custom-formula tests: `SLOW` is
/// async; `SYNCFN` is a normal sync function; everything else is
/// unregistered. `lookups` counts sync dispatches — it must stay 0
/// for async names (the engine never routes them through `lookup`).
#[derive(Default)]
struct AsyncTestRegistry {
    lookups: std::sync::Mutex<usize>,
}
impl std::fmt::Debug for AsyncTestRegistry {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "AsyncTestRegistry")
    }
}
impl CustomFunctionRegistry for AsyncTestRegistry {
    fn lookup(&self, name: &str, _args: &[Value]) -> Option<Value> {
        *self.lookups.lock().unwrap() += 1;
        if name.eq_ignore_ascii_case("SYNCFN") {
            Some(Value::Number(7.0))
        } else {
            None
        }
    }
    fn is_async(&self, name: &str) -> bool {
        name.eq_ignore_ascii_case("SLOW")
    }
}

#[test]
fn async_custom_busy_then_settles_and_propagates() {
    let mut wb = Workbook::new();
    let registry = Arc::new(AsyncTestRegistry::default());
    wb.set_custom_function_registry(Some(registry.clone() as Arc<dyn CustomFunctionRegistry>));
    assert!(wb.set_formula(0, "A1", "=SLOW(1)"));
    assert!(wb.set_formula(0, "B1", "=A1+1"));

    // Pending: the cell and its dependent both show #BUSY! via the
    // normal error short-circuit.
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Error(ValueError::Busy));
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Error(ValueError::Busy));

    let calls = wb.take_pending_async_custom_calls();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].name, "SLOW");
    assert_eq!(calls[0].args, vec![Value::Number(1.0)]);

    assert!(wb
        .resolve_async_custom_call(calls[0].call_id, Value::Number(10.0))
        .unwrap());
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(10.0));
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(11.0));

    // Async dispatch never consulted `lookup`, and the settled result
    // is memoized — re-reads enqueue nothing.
    assert_eq!(*registry.lookups.lock().unwrap(), 0);
    assert!(wb.take_pending_async_custom_calls().is_empty());
}

#[test]
fn async_custom_same_args_dedupe_to_one_call() {
    let mut wb = Workbook::new();
    wb.set_custom_function_registry(Some(
        Arc::new(AsyncTestRegistry::default()) as Arc<dyn CustomFunctionRegistry>
    ));
    assert!(wb.set_formula(0, "A1", "=SLOW(2)"));
    assert!(wb.set_formula(0, "A2", "=SLOW(2)"));
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Error(ValueError::Busy));
    assert_eq!(wb.get_cell("Sheet1", "A2"), Value::Error(ValueError::Busy));

    let calls = wb.take_pending_async_custom_calls();
    assert_eq!(calls.len(), 1, "same (name, args) must enqueue once");

    assert!(wb
        .resolve_async_custom_call(calls[0].call_id, Value::Text("done".into()))
        .unwrap());
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Text("done".into()));
    assert_eq!(wb.get_cell("Sheet1", "A2"), Value::Text("done".into()));
}

#[test]
fn async_custom_registry_change_discards_stale_settle_and_rearms() {
    let mut wb = Workbook::new();
    wb.set_custom_function_registry(Some(
        Arc::new(AsyncTestRegistry::default()) as Arc<dyn CustomFunctionRegistry>
    ));
    assert!(wb.set_formula(0, "A1", "=SLOW(3)"));
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Error(ValueError::Busy));
    let calls = wb.take_pending_async_custom_calls();
    assert_eq!(calls.len(), 1);
    let stale_id = calls[0].call_id;

    // Registry changes while the promise is in flight.
    wb.invalidate_all_formulas_for_custom_function_change();

    // The stale settle is dropped…
    assert!(!wb
        .resolve_async_custom_call(stale_id, Value::Number(5.0))
        .unwrap());
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Error(ValueError::Busy));

    // …and the re-read re-armed the call under a fresh id.
    let calls = wb.take_pending_async_custom_calls();
    assert_eq!(calls.len(), 1);
    assert_ne!(calls[0].call_id, stale_id);
    assert!(wb
        .resolve_async_custom_call(calls[0].call_id, Value::Number(6.0))
        .unwrap());
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(6.0));
}

#[test]
fn async_custom_arg_error_short_circuits_without_enqueue() {
    let mut wb = Workbook::new();
    wb.set_custom_function_registry(Some(
        Arc::new(AsyncTestRegistry::default()) as Arc<dyn CustomFunctionRegistry>
    ));
    assert!(wb.set_formula(0, "A1", "=SLOW(1/0)"));
    assert_eq!(
        wb.get_cell("Sheet1", "A1"),
        Value::Error(ValueError::DivisionByZero)
    );
    assert!(wb.take_pending_async_custom_calls().is_empty());
    assert_eq!(wb.async_custom_entry_count(), 0);
}

/// take/resolve are mutation entry points and follow the same
/// in-callback rejection contract as every other one.
#[test]
fn async_custom_take_and_resolve_rejected_inside_callback() {
    use std::sync::Mutex;

    struct ReentrantRegistry {
        wb_ptr: Mutex<*mut Workbook>,
        observed: Mutex<Option<(usize, Result<bool, WorkbookError>)>>,
    }
    unsafe impl Send for ReentrantRegistry {}
    unsafe impl Sync for ReentrantRegistry {}
    impl std::fmt::Debug for ReentrantRegistry {
        fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            write!(f, "ReentrantRegistry")
        }
    }
    impl CustomFunctionRegistry for ReentrantRegistry {
        fn lookup(&self, _name: &str, _args: &[Value]) -> Option<Value> {
            let wb_ptr = *self.wb_ptr.lock().unwrap();
            let (taken, resolved) = unsafe {
                (
                    (*wb_ptr).take_pending_async_custom_calls().len(),
                    (*wb_ptr).resolve_async_custom_call(1, Value::Number(1.0)),
                )
            };
            *self.observed.lock().unwrap() = Some((taken, resolved));
            Some(Value::Number(0.0))
        }
    }

    let mut wb = Workbook::new();
    let registry = Arc::new(ReentrantRegistry {
        wb_ptr: Mutex::new(&mut wb as *mut Workbook),
        observed: Mutex::new(None),
    });
    wb.set_custom_function_registry(Some(registry.clone() as Arc<dyn CustomFunctionRegistry>));
    *registry.wb_ptr.lock().unwrap() = &mut wb as *mut Workbook;
    assert!(wb.set_formula(0, "A1", "=REENTER()"));
    let _ = wb.get_cell("Sheet1", "A1");

    let observed = registry.observed.lock().unwrap().clone();
    let (taken, resolved) = observed.expect("callback must have run");
    assert_eq!(taken, 0, "take inside callback must return empty");
    assert_eq!(
        resolved,
        Err(WorkbookError::MutationDuringCustomCall),
        "resolve inside callback must be rejected"
    );
}

#[test]
fn async_custom_cap_sweep_evicts_unobserved_entries() {
    use crate::sheet::ASYNC_CUSTOM_RESULT_CACHE_CAP;

    let mut wb = Workbook::new();
    wb.set_custom_function_registry(Some(
        Arc::new(AsyncTestRegistry::default()) as Arc<dyn CustomFunctionRegistry>
    ));
    let over_cap = ASYNC_CUSTOM_RESULT_CACHE_CAP + 88;
    for i in 0..over_cap {
        let addr = format!("A{}", i + 1);
        assert!(wb.set_formula(0, &addr, &format!("=SLOW({i})")));
        let _ = wb.get_cell("Sheet1", &addr);
    }
    assert_eq!(wb.async_custom_entry_count(), over_cap);

    // Overwrite every formula so no formula-inner depends on the
    // result atoms any more, then drain — the sweep runs first.
    for i in 0..over_cap {
        wb.set_cell(0, &format!("A{}", i + 1), Value::Number(0.0));
    }
    let _ = wb.take_pending_async_custom_calls();
    assert!(
        wb.async_custom_entry_count() <= ASYNC_CUSTOM_RESULT_CACHE_CAP,
        "sweep must bring unobserved entries back under the cap (got {})",
        wb.async_custom_entry_count()
    );
}
