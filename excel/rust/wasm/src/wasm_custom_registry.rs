// === Wave 8 custom-formula registry ===
//
// `CustomFormulaRegistry` holds a map of upper-cased name → `js_sys::Function`
// (the JS callback the host registered via `registerCustomFormula`). When
// the formula engine encounters an unknown function name and falls through
// to `EvalProvider::call_custom`, the WorkbookEvalProvider impl delegates
// to the registry's `lookup`, which marshals args from `Value` to `JsValue`,
// invokes the callback, and marshals the return back.
//
// Thread safety: `js_sys::Function` is `!Send + !Sync` (it holds a JS-side
// reference). wasm32-unknown-unknown is single-threaded by default, so we
// wrap the inner state in `Mutex` (purely to satisfy the `CustomFunctionRegistry`
// trait's `Sync` bound — the Mutex is never contended in practice) and the
// outer struct is `Send + Sync` by virtue of the Mutex. The native-only
// `cargo check --target host` path also compiles because js-sys ships
// stubs for non-wasm targets.

/// Concrete `CustomFunctionRegistry` impl backed by a `HashMap` of
/// `js_sys::Function`s. Exposed via `WasmWorkbook::register_custom_formula`
/// / `unregister_custom_formula`.
///
/// All lookups upper-case `name` so JS-side registration is case-
/// insensitive: `wb.registerCustomFormula("myfunc", fn)` and `=MYFUNC()`
/// resolve to the same entry. Matches Excel + the defined-name registry.
struct WasmCustomFormulaRegistry {
    inner: Mutex<HashMap<String, CustomEntry>>,
}

/// One registry slot. Sync entries hold the JS callback and dispatch
/// through `lookup` during evaluation. Async entries are a name-only
/// marker: the engine memoizes the call and enqueues a pending request,
/// and the WORKER invokes the JS callback from its own local map on its
/// own event loop — the callback never crosses into wasm, so evaluation
/// stays synchronous.
enum CustomEntry {
    Sync(js_sys::Function),
    Async,
}

impl std::fmt::Debug for WasmCustomFormulaRegistry {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let count = self.inner.lock().map(|map| map.len()).unwrap_or(0);
        write!(f, "WasmCustomFormulaRegistry({count} fns)")
    }
}

// SAFETY: js_sys::Function is not Send/Sync in general, but on wasm32 the
// runtime is single-threaded and we never hand the Mutex out across
// threads — the workbook is owned by a single Worker. The unsafe impls
// satisfy the CustomFunctionRegistry bound without a third-party
// `SendWrapper` dep.
//
// The `cfg(not(target_feature = "atomics"))` guard is a compile-time
// fuse: if a future build flips on wasm-bindgen-rayon / shared-memory
// threads (which set the `atomics` target feature), the `Send`/`Sync`
// impls disappear and `WasmCustomFormulaRegistry` will fail to satisfy
// the `CustomFunctionRegistry: Send + Sync` bound. That surfaces the
// unsoundness as a compile error at the boundary rather than silently
// allowing UB at runtime. Re-enabling threads requires re-architecting
// the registry around `SendWrapper` / a worker-bound channel.
#[cfg(not(target_feature = "atomics"))]
unsafe impl Send for WasmCustomFormulaRegistry {}
#[cfg(not(target_feature = "atomics"))]
unsafe impl Sync for WasmCustomFormulaRegistry {}

impl WasmCustomFormulaRegistry {
    fn new() -> Self {
        WasmCustomFormulaRegistry {
            inner: Mutex::new(HashMap::new()),
        }
    }

    fn register(&self, name: &str, callback: js_sys::Function) {
        if let Ok(mut map) = self.inner.lock() {
            map.insert(name.to_ascii_uppercase(), CustomEntry::Sync(callback));
        }
    }

    fn register_async(&self, name: &str) {
        if let Ok(mut map) = self.inner.lock() {
            map.insert(name.to_ascii_uppercase(), CustomEntry::Async);
        }
    }

    fn unregister(&self, name: &str) -> bool {
        self.inner
            .lock()
            .map(|mut map| map.remove(&name.to_ascii_uppercase()).is_some())
            .unwrap_or(false)
    }

    fn registered_names(&self) -> Vec<String> {
        self.inner
            .lock()
            .map(|map| map.keys().cloned().collect())
            .unwrap_or_default()
    }

    fn count(&self) -> usize {
        self.inner.lock().map(|map| map.len()).unwrap_or(0)
    }
}

impl CustomFunctionRegistry for WasmCustomFormulaRegistry {
    fn lookup(&self, name: &str, args: &[Value]) -> Option<Value> {
        let key = name.to_ascii_uppercase();
        let callback = {
            let map = self.inner.lock().ok()?;
            match map.get(&key)? {
                CustomEntry::Sync(callback) => callback.clone(),
                // Async names never dispatch through lookup — the engine
                // routes them to the memoized pending path before this
                // point. Reaching here means the engine-side is_async
                // gate was bypassed; fail loudly as #NAME? rather than
                // invoking nothing.
                CustomEntry::Async => return Some(Value::Error(ValueError::InvalidName)),
            }
        };
        Some(invoke_js_custom_formula(&callback, args))
    }

    fn is_async(&self, name: &str) -> bool {
        self.inner
            .lock()
            .map(|map| {
                matches!(
                    map.get(&name.to_ascii_uppercase()),
                    Some(CustomEntry::Async)
                )
            })
            .unwrap_or(false)
    }
}

// Marshal `args` to a JS Array and invoke `callback`, then marshal the
// return value back to a `Value`. Centralized so the conversion rules
