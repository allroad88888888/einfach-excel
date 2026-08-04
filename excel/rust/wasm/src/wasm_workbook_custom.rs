#[wasm_bindgen]
impl WasmWorkbook {
    #[wasm_bindgen(js_name = "registerCustomFormula")]
    pub fn register_custom_formula(&mut self, name: String, callback: js_sys::Function) {
        self.custom_formulas.register(&name, callback);
        self.workbook
            .invalidate_all_formulas_for_custom_function_change();
    }

    /// Register `name` as an ASYNC custom formula. Name-only: the JS
    /// callback stays in the worker's local map and never crosses into
    /// wasm. During evaluation the engine memoizes per (name, args),
    /// holds the cell at `#BUSY!`, and enqueues a pending request; the
    /// host drains with `drainAsyncCustomRequests`, awaits the callback,
    /// and settles with `resolveAsyncCustomCall`. Registering over an
    /// existing name (sync or async) replaces it and publishes the
    /// registry root like `registerCustomFormula`.
    #[wasm_bindgen(js_name = "registerCustomFormulaAsync")]
    pub fn register_custom_formula_async(&mut self, name: String) {
        self.custom_formulas.register_async(&name);
        self.workbook
            .invalidate_all_formulas_for_custom_function_change();
    }

    /// Drain the async custom-formula request queue accumulated since the
    /// last drain. Returns `Array<{ callId: number, name: string,
    /// args: Array<number|string|boolean|null|any[][]> }>` — args marshal
    /// with the same rules as sync callback invocation (ranges arrive as
    /// 2-D row-major arrays). call_id is a u64 exposed as f64: safe below
    /// 2^53 calls. Call after any mutation entry point; empty queue
    /// returns an empty array at negligible cost.
    #[wasm_bindgen(js_name = "drainAsyncCustomRequests")]
    pub fn drain_async_custom_requests(&mut self) -> JsValue {
        let arr = js_sys::Array::new();
        for call in self.workbook.take_pending_async_custom_calls() {
            let obj = js_sys::Object::new();
            let _ = js_sys::Reflect::set(
                &obj,
                &JsValue::from_str("callId"),
                &JsValue::from_f64(call.call_id as f64),
            );
            let _ = js_sys::Reflect::set(
                &obj,
                &JsValue::from_str("name"),
                &JsValue::from_str(&call.name),
            );
            let args = js_sys::Array::new();
            for v in &call.args {
                args.push(&value_to_js(v));
            }
            let _ = js_sys::Reflect::set(&obj, &JsValue::from_str("args"), &args);
            arr.push(&obj);
        }
        arr.into()
    }

    /// Settle an async custom-formula call. `value` marshals with the
    /// same rules as a sync callback's return (`js_to_value`): scalars,
    /// error tokens / `{ error }` objects; `#BUSY!` demotes to `#VALUE!`.
    /// The worker maps callback throw/reject to `{ error: "#VALUE!" }`
    /// and calls this same entry — there is no separate reject API.
    /// Returns `false` when the call is unknown or stale (registry
    /// changed while the Promise was in flight); the value is dropped.
    #[wasm_bindgen(js_name = "resolveAsyncCustomCall")]
    pub fn resolve_async_custom_call(&mut self, call_id: f64, value: JsValue) -> bool {
        let settled = js_to_value(&value);
        self.workbook
            .resolve_async_custom_call(call_id as u64, settled)
            .unwrap_or(false)
    }

    /// Remove a previously-registered custom formula. Returns `true` if
    /// an entry was removed; `false` if no entry existed. The registry Store
    /// root is published only when removal succeeds, so materialized formulas
    /// that consulted it re-derive and may surface `#NAME?`.
    #[wasm_bindgen(js_name = "unregisterCustomFormula")]
    pub fn unregister_custom_formula(&mut self, name: &str) -> bool {
        let removed = self.custom_formulas.unregister(name);
        if removed {
            self.workbook
                .invalidate_all_formulas_for_custom_function_change();
        }
        removed
    }

    /// Number of currently-registered custom formulas. Debug probe so
    /// JS tests can assert their register / unregister calls landed.
    #[wasm_bindgen(js_name = "customFormulaCount")]
    pub fn custom_formula_count(&self) -> u32 {
        self.custom_formulas.count() as u32
    }

    /// List of registered custom-formula names (upper-cased). Stable
    /// alphabetical ordering not guaranteed — `HashMap::keys()` order.
    /// Used by hosts that want to render a "registered formulas"
    /// inspector. Returns a `JsValue::Array<String>`.
    #[wasm_bindgen(js_name = "customFormulaNames")]
    pub fn custom_formula_names(&self) -> JsValue {
        let arr = js_sys::Array::new();
        for n in self.custom_formulas.registered_names() {
            arr.push(&JsValue::from_str(&n));
        }
        arr.into()
    }

    /// Number of cross-sheet dependent edges currently tracked on the
    /// workbook. Track L's e2e gates fan-out correctness through this
    /// probe.
    ///
    /// Delegates to `Workbook::debug_cross_sheet_reverse_edge_count` —
    /// counts entries in the workbook's cross-sheet reverse dep index.
    pub fn debug_cross_sheet_dependents_count(&self) -> u32 {
        self.workbook.debug_cross_sheet_reverse_edge_count() as u32
    }

    // Batch import plain JSON cell records through `Workbook::bulk_load`.
    //
    // Coordinates are zero-based (`row=0, col=0` means A1). Formula cells
    // are installed dirty and remain lazy until a read/subscription hydrates
}
