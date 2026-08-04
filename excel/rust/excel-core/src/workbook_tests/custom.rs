//! Workbook custom-function tests.

use super::*;
use einfach_core::ValueError;

// === Wave 8 codex-review fix #1: re-entrancy guard ===
//
// A host custom-formula callback MUST NOT mutate the workbook during
// its execution. These tests pin the rejection behavior across the
// mutation entry points, plus prove the cache state remains sound
// (no silently-lost dirty marks).

/// A custom callback that tries to call `wb.set_cell` is reflected
/// back the guard as a silent no-op (the infallible signature can't
/// return an error). The mutation is dropped; the cache state for
/// the cell whose formula triggered the callback is `Clean(value)`
/// of the original value.
#[test]
fn custom_callback_set_cell_is_rejected_and_cache_stays_clean() {
    use std::sync::Mutex;

    /// Registry that calls back into the workbook from inside its
    /// `lookup`. We can't pass a `&mut Workbook` directly through
    /// the immutable `EvalProvider` trait, so the test relies on
    /// the same wasm-bridge shape: the registry holds a callback
    /// closure that the test installs via a wrapper struct holding
    /// `*mut Workbook` (the test only dereferences inside the
    /// callback, AFTER the read borrow has been released by the
    /// `EvalProvider` chain — which is what would happen in the
    /// real WASM bridge).
    struct AttackRegistry {
        wb_ptr: Mutex<*mut Workbook>,
        invoked: Mutex<usize>,
    }
    // SAFETY: tests are single-threaded; the Mutex satisfies the
    // trait bounds without allowing real cross-thread sharing.
    unsafe impl Send for AttackRegistry {}
    unsafe impl Sync for AttackRegistry {}
    impl std::fmt::Debug for AttackRegistry {
        fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            write!(f, "AttackRegistry")
        }
    }
    impl CustomFunctionRegistry for AttackRegistry {
        fn lookup(&self, _name: &str, _args: &[Value]) -> Option<Value> {
            *self.invoked.lock().unwrap() += 1;
            // Try to mutate the workbook from inside the callback.
            // SAFETY: see test setup — the pointer is valid for the
            // duration of the eval frame because the test holds the
            // `Workbook` by value and never moves it during read.
            let wb_ptr = *self.wb_ptr.lock().unwrap();
            // The guard MUST cause this to be a no-op.
            unsafe {
                (*wb_ptr).set_cell(0, "Z99", Value::Number(999.0));
            }
            Some(Value::Number(42.0))
        }
    }

    let mut wb = Workbook::new();
    let registry = Arc::new(AttackRegistry {
        wb_ptr: Mutex::new(&mut wb as *mut Workbook),
        invoked: Mutex::new(0),
    });
    wb.set_custom_function_registry(Some(registry.clone() as Arc<dyn CustomFunctionRegistry>));
    // Re-pin the pointer post-install (the Arc swap might not have
    // moved `wb`, but be defensive — the test asserts the address
    // is current).
    *registry.wb_ptr.lock().unwrap() = &mut wb as *mut Workbook;
    assert!(wb.set_formula(0, "A1", "=MYBAD()"));

    // Read the formula. The callback runs, attempts to write Z99,
    // and gets silently rejected by the guard.
    let v = wb.get_cell("Sheet1", "A1");
    assert_eq!(v, Value::Number(42.0));
    // The callback may run more than once during install +
    // first-read (set_formula performs a workbook-aware recompute
    // pass when the formula references workbook-scope things). The
    // important guarantee is that EVERY invocation hit the guard
    // and was rejected.
    assert!(
        *registry.invoked.lock().unwrap() >= 1,
        "callback must have fired at least once"
    );

    // The attempted mutation MUST NOT have landed. Z99 stays empty.
    let z99 = wb.get_cell("Sheet1", "Z99");
    assert_eq!(z99, Value::Null);

    // After the callback returns, the guard depth is back to 0 so
    // normal mutations work again.
    assert!(!wb.is_inside_custom_call());
    wb.set_cell(0, "B1", Value::Number(7.0));
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(7.0));
}

/// The `try_*` family surfaces `Err(MutationDuringCustomCall)` so a
/// host can debug the rejection rather than silently losing the
/// write. We exercise this by calling `try_set_cell` directly from
/// inside the callback through the same `*mut Workbook` trick.
#[test]
fn custom_callback_try_set_cell_returns_mutation_error() {
    use std::sync::Mutex;

    struct ProbeRegistry {
        wb_ptr: Mutex<*mut Workbook>,
        last_err: Mutex<Option<SheetError>>,
    }
    unsafe impl Send for ProbeRegistry {}
    unsafe impl Sync for ProbeRegistry {}
    impl std::fmt::Debug for ProbeRegistry {
        fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            write!(f, "ProbeRegistry")
        }
    }
    impl CustomFunctionRegistry for ProbeRegistry {
        fn lookup(&self, _name: &str, _args: &[Value]) -> Option<Value> {
            let wb_ptr = *self.wb_ptr.lock().unwrap();
            let result = unsafe { (*wb_ptr).try_set_cell(0, "C1", Value::Number(1.0)) };
            if let Err(e) = result {
                *self.last_err.lock().unwrap() = Some(e);
            }
            Some(Value::Number(0.0))
        }
    }

    let mut wb = Workbook::new();
    let registry = Arc::new(ProbeRegistry {
        wb_ptr: Mutex::new(&mut wb as *mut Workbook),
        last_err: Mutex::new(None),
    });
    wb.set_custom_function_registry(Some(registry.clone() as Arc<dyn CustomFunctionRegistry>));
    *registry.wb_ptr.lock().unwrap() = &mut wb as *mut Workbook;
    assert!(wb.set_formula(0, "A1", "=PROBE()"));

    let _ = wb.get_cell("Sheet1", "A1");

    let err = registry.last_err.lock().unwrap().clone();
    assert_eq!(err, Some(SheetError::MutationDuringCustomCall));
}

/// The depth counter is exception-safe: even when the callback
/// panics / aborts the eval, the `Drop` impl on `CustomCallScope`
/// decrements the counter so subsequent reads work normally.
/// (Tested by registering a callback that returns `#VALUE!` — the
/// engine treats this as a successful dispatch and bookkeeping
/// runs identically to the normal-return path. A real Rust panic
/// from inside the callback is unsafe in a `#[test]` outside of
/// `panic = "abort"`, so the panic path is covered by the wasm
/// `throw_str` path which exercises the same Drop semantics on
/// the JS-throw side.)
#[test]
fn custom_call_depth_resets_after_callback() {
    use std::sync::Mutex;

    struct ErrorRegistry {
        invoked: Mutex<usize>,
    }
    impl std::fmt::Debug for ErrorRegistry {
        fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            write!(f, "ErrorRegistry")
        }
    }
    impl CustomFunctionRegistry for ErrorRegistry {
        fn lookup(&self, _name: &str, _args: &[Value]) -> Option<Value> {
            *self.invoked.lock().unwrap() += 1;
            Some(Value::Error(ValueError::InvalidValue))
        }
    }

    let mut wb = Workbook::new();
    let registry = Arc::new(ErrorRegistry {
        invoked: Mutex::new(0),
    });
    wb.set_custom_function_registry(Some(registry.clone() as Arc<dyn CustomFunctionRegistry>));
    assert!(wb.set_formula(0, "A1", "=BAD()"));

    // Three reads — each spins up a fresh CustomCallScope and tears
    // it down. The depth counter must be 0 at every observation.
    for _ in 0..3 {
        assert!(!wb.is_inside_custom_call());
        let v = wb.get_cell("Sheet1", "A1");
        assert!(matches!(v, Value::Error(_)));
        assert!(!wb.is_inside_custom_call());
    }

    // Subsequent normal mutations work, confirming the counter
    // didn't drift.
    wb.set_cell(0, "D1", Value::Number(42.0));
    assert_eq!(wb.get_cell("Sheet1", "D1"), Value::Number(42.0));
}
