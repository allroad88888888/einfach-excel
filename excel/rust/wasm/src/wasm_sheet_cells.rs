#[wasm_bindgen]
impl WasmSheet {
    /// Create a new empty spreadsheet.
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        install_panic_hook();
        WasmSheet {
            sheet: Sheet::new(),
            subscriptions: HashMap::new(),
            next_token: 0,
        }
    }

    /// Set a cell to a numeric value. Subscribers fire automatically via the
    /// store's propagation pass — no manual fire_listeners needed (C.1+C.2).
    pub fn set_number(&mut self, addr: &str, value: f64) {
        self.sheet.set_cell(addr, Value::Number(value));
    }

    /// Clear a cell to empty. Mirrors ISheet.clear_cell on the JS side.
    pub fn clear_cell(&mut self, addr: &str) {
        self.sheet.clear_cell(addr);
    }

    /// Clear non-empty cells in a zero-based inclusive range. The core scans
    /// sparse entries only and coalesces dirty/subscriber propagation.
    pub fn clear_range(
        &mut self,
        start_row: u32,
        start_col: u32,
        end_row: u32,
        end_col: u32,
    ) -> u32 {
        let range = CellRange::new(
            CellAddress::new(start_row, start_col),
            CellAddress::new(end_row, end_col),
        );
        self.sheet.clear_range(range) as u32
    }

    pub fn insert_row(&mut self, at: u32, count: u32) {
        self.sheet.insert_row(at, count);
    }
    pub fn delete_row(&mut self, at: u32, count: u32) {
        self.sheet.delete_row(at, count);
    }
    pub fn insert_col(&mut self, at: u32, count: u32) {
        self.sheet.insert_col(at, count);
    }
    pub fn delete_col(&mut self, at: u32, count: u32) {
        self.sheet.delete_col(at, count);
    }

    /// Set a cell to a text value.
    pub fn set_text(&mut self, addr: &str, value: &str) {
        self.sheet.set_cell(addr, Value::Text(value.to_string()));
    }

    /// Set a cell to a boolean value.
    pub fn set_boolean(&mut self, addr: &str, value: bool) {
        self.sheet.set_cell(addr, Value::Boolean(value));
    }

    /// Set a cell to an error value by its display code. Unknown codes fall
    /// back to #VALUE!, matching the generic invalid-value error.
    pub fn set_error(&mut self, addr: &str, value: &str) {
        let err = error_token_to_value_error(value).unwrap_or(ValueError::InvalidValue);
        self.sheet.set_cell(addr, Value::Error(err));
    }

    /// Set a cell's formula (e.g. "=A1+B1").
    /// Returns `true` if the formula parsed successfully, `false` if it was
    /// invalid (cell becomes `#VALUE!`) or would form a cycle (cell becomes `#CYCLE!`).
    pub fn set_formula(&mut self, addr: &str, formula: &str) -> bool {
        self.sheet.set_formula(addr, formula)
    }

    /// Get a cell's display value as a string.
    pub fn get_display(&mut self, addr: &str) -> String {
        let val = self.sheet.get_cell(addr);
        value_to_display(&val)
    }

    /// Get a cell's raw numeric value. Returns NaN if not a number.
    pub fn get_number(&mut self, addr: &str) -> f64 {
        // Collapse a spill anchor's Array to its top-left element first,
        // so a spilled numeric anchor returns the [0][0] number instead
        // of NaN (the JS boundary contract).
        match collapse_array_for_js(&self.sheet.get_cell(addr)).into_owned() {
            Value::Number(n) => n,
            _ => f64::NAN,
        }
    }

    /// Get the type of a cell's value: "number", "text", "boolean", "null", "error"
    pub fn get_type(&mut self, addr: &str) -> String {
        // Funnel through `value_to_cell_type` so spill anchors collapse
        // to their top-left element's type instead of leaking an Array
        // string the JS layer wouldn't know how to handle.
        value_to_cell_type(&self.sheet.get_cell(addr))
    }

    /// Check if a cell contains an error.
    pub fn is_error(&mut self, addr: &str) -> bool {
        self.sheet.get_cell(addr).is_error()
    }

    /// If `addr` is a dynamic-array spill *anchor*, return the spill
    /// shape as a `[rows, cols]` `Uint32Array`. Returns `undefined` /
    /// `null` (`JsValue::null`) for plain cells, spilled-into cells,
    /// and `#SPILL!` anchors. The JS UI uses this to render the spill
    /// border around the anchor's bounding rectangle.
    #[wasm_bindgen(js_name = "spillInfo")]
    pub fn spill_info(&self, addr: &str) -> JsValue {
        let Some(parsed) = CellAddress::parse(addr) else {
            return JsValue::null();
        };
        match self.sheet.spill_info(parsed) {
            Some((rows, cols)) => {
                let arr = js_sys::Uint32Array::new_with_length(2);
                arr.copy_from(&[rows, cols]);
                arr.into()
            }
            None => JsValue::null(),
        }
    }

    /// Set multiple cells at once (batch). Pass arrays of addresses and values.
    pub fn batch_set_numbers(&mut self, addrs: Vec<String>, values: Vec<f64>) {
        let pairs: Vec<(&str, Value)> = addrs
            .iter()
            .zip(values.iter())
            .map(|(a, v)| (a.as_str(), Value::Number(*v)))
            .collect();
        self.sheet.batch_set(&pairs);
    }

    /// Subscribe to changes on a cell. Returns an opaque u32 token to pass
    /// to `unsubscribe`. The callback fires whenever the cell's value
    /// changes — including transitively through formula dependencies (C.2).
    pub fn subscribe(&mut self, addr: &str, callback: js_sys::Function) -> u32 {
        let token = self.next_token;
        self.next_token = self.next_token.wrapping_add(1);
        let listener = JsCallbackListener { callback };
        let sub = self.sheet.subscribe_cell_boxed(addr, Box::new(listener));
        self.subscriptions.insert(token, sub);
        token
    }

    /// Cancel a subscription previously returned from `subscribe`.
    /// Idempotent: unknown tokens are ignored.
    pub fn unsubscribe(&mut self, token: u32) {
        if let Some(sub) = self.subscriptions.remove(&token) {
            self.sheet.unsubscribe_cell(sub);
        }
    }

    /// Debug-only panic injection — arms a one-shot flag so the next
    /// JsCallbackListener fire panics inside its microtask. After consumption
    /// the flag clears, so subsequent fires behave normally. Used by
    /// `regression.spec.ts` (Discovered #E.2) to verify console_error_panic_hook
    /// surfaces the panic to console.error AND the wasm instance keeps
    /// working for subsequent set_/get_ calls. Not part of the production
    /// API surface — naming with `__` prefix to flag.
    #[wasm_bindgen(js_name = "__debugPanicNextCallback")]
    pub fn debug_panic_next_callback(&self) {
        PANIC_NEXT_CALLBACK.with(|c| c.set(true));
    }

    /// Return a cell's original formula text, or empty string for cells
    /// without a formula. Used by the formula bar / double-click edit so
    /// users edit `=A1*2` instead of the displayed result `20` (D.11).
    pub fn get_formula(&self, addr: &str) -> String {
        self.sheet.get_formula(addr).unwrap_or_default()
    }

    /// Every non-empty address on this sheet, as `"A1"`-style strings.
    /// Empty cells are skipped; an address holding both a primitive slot
    /// and a formula appears once (formula dominates). Used by
    /// structural-undo to snapshot only what needs restoring — see
    /// `excel/solid-excel/docs/STRUCTURAL_UNDO.md`.
    pub fn non_empty_addrs(&self) -> Vec<String> {
        self.sheet.non_empty_addrs()
    }

    // Phase 6 — set the format for a cell. `fmt` is a plain JS object
    // matching `CellFormatJSON` (numberFormat, bold, italic, align,
    // bgColor, fgColor). Passing `null` / `undefined` / `{}` removes any
}
