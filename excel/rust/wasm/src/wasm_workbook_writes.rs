#[wasm_bindgen]
impl WasmWorkbook {
    pub fn set_cell_number(&mut self, sheet_idx: usize, addr: &str, value: f64) {
        self.workbook
            .set_cell(sheet_idx, addr, Value::Number(value));
    }

    /// Set a cell to a text value through the workbook. Cross-sheet aware.
    pub fn set_cell_text(&mut self, sheet_idx: usize, addr: &str, value: &str) {
        self.workbook
            .set_cell(sheet_idx, addr, Value::Text(value.to_string()));
    }

    /// Set a cell to a boolean value through the workbook. Cross-sheet aware.
    pub fn set_cell_boolean(&mut self, sheet_idx: usize, addr: &str, value: bool) {
        self.workbook
            .set_cell(sheet_idx, addr, Value::Boolean(value));
    }

    /// Set a cell to an error value through the workbook. Cross-sheet aware.
    pub fn set_cell_error(&mut self, sheet_idx: usize, addr: &str, value: &str) {
        let err = value_error_from_display(value);
        self.workbook.set_cell(sheet_idx, addr, Value::Error(err));
    }

    /// Clear a cell through the workbook. Local and cross-sheet formulas that
    /// read the cell re-derive through the shared Store graph.
    #[wasm_bindgen(js_name = "clearCellAt")]
    pub fn clear_cell_at(&mut self, sheet_idx: usize, addr: &str) {
        self.workbook.clear_cell(sheet_idx, addr);
    }

    /// Set a cell's formula through the workbook. Returns `true` if the
    /// formula parsed and installed cleanly, `false` if parse failed
    /// (cell becomes `#VALUE!`) or a cycle was detected (cell becomes
    /// `#CYCLE!`).
    ///
    /// The legacy `set_formula(sheet_idx: u32, ...)` routes through the same
    /// workbook method. This `usize`-typed alias is retained for generated
    /// bindings and worker callers.
    #[wasm_bindgen(js_name = "setFormulaAt")]
    pub fn set_formula_at(&mut self, sheet_idx: usize, addr: &str, src: &str) -> bool {
        self.workbook.set_formula(sheet_idx, addr, src)
    }

    // === Dynamic-array spill: fallible setters ===
    //
    // These mirror the infallible `set_cell_*` / `setFormulaAt` /
    // `clearCellAt` entries above but surface `SheetError::SpillCellWrite`
    // across the WASM boundary so the JS layer can show a "cannot edit
    // spill" toast and restore the cell display. The result shape is:
    //
    //   { ok: true } | { ok: false, code: 'spill-write', anchor: 'A1' }
    //
    // `code: 'invalid-address'` is also returned for unparseable addrs;
    // the legacy infallible path silently no-ops in that case.

    #[wasm_bindgen(js_name = "trySetCellNumber")]
    pub fn try_set_cell_number(
        &mut self,
        sheet_idx: usize,
        addr: &str,
        value: f64,
    ) -> Result<JsValue, JsValue> {
        try_set_cell_result(
            self.workbook
                .try_set_cell(sheet_idx, addr, Value::Number(value)),
        )
    }

    #[wasm_bindgen(js_name = "trySetCellText")]
    pub fn try_set_cell_text(
        &mut self,
        sheet_idx: usize,
        addr: &str,
        value: &str,
    ) -> Result<JsValue, JsValue> {
        try_set_cell_result(self.workbook.try_set_cell(
            sheet_idx,
            addr,
            Value::Text(value.to_string()),
        ))
    }

    #[wasm_bindgen(js_name = "trySetCellBoolean")]
    pub fn try_set_cell_boolean(
        &mut self,
        sheet_idx: usize,
        addr: &str,
        value: bool,
    ) -> Result<JsValue, JsValue> {
        try_set_cell_result(
            self.workbook
                .try_set_cell(sheet_idx, addr, Value::Boolean(value)),
        )
    }

    #[wasm_bindgen(js_name = "trySetCellError")]
    pub fn try_set_cell_error(
        &mut self,
        sheet_idx: usize,
        addr: &str,
        value: &str,
    ) -> Result<JsValue, JsValue> {
        let err = value_error_from_display(value);
        try_set_cell_result(
            self.workbook
                .try_set_cell(sheet_idx, addr, Value::Error(err)),
        )
    }

    #[wasm_bindgen(js_name = "tryClearCellAt")]
    pub fn try_clear_cell_at(&mut self, sheet_idx: usize, addr: &str) -> Result<JsValue, JsValue> {
        try_set_cell_result(self.workbook.try_clear_cell(sheet_idx, addr))
    }

    /// Returns the formula install outcome plus an optional spill-write
    /// rejection. JS shape:
    ///   { ok: true, installed: true } | { ok: true, installed: false }
    ///     | { ok: false, code: 'spill-write', anchor: 'A1' }
    /// `installed: false` corresponds to parse failure (`#VALUE!`) or
    /// cycle detection (`#CYCLE!`) — the cell value already reflects
    /// that, and the caller can pick it up via a follow-up snapshot.
    #[wasm_bindgen(js_name = "trySetFormulaAt")]
    pub fn try_set_formula_at(
        &mut self,
        sheet_idx: usize,
        addr: &str,
        src: &str,
    ) -> Result<JsValue, JsValue> {
        match self.workbook.try_set_formula(sheet_idx, addr, src) {
            Ok(installed) => {
                let obj = js_sys::Object::new();
                js_sys::Reflect::set(&obj, &JsValue::from_str("ok"), &JsValue::TRUE).ok();
                js_sys::Reflect::set(
                    &obj,
                    &JsValue::from_str("installed"),
                    &JsValue::from_bool(installed),
                )
                .ok();
                Ok(obj.into())
            }
            Err(err) => Ok(sheet_error_to_js(err)),
        }
    }

    // Look up the spill anchor for a non-anchor spilled cell. Returns
    // the anchor address as a `"A1"`-style string, or `null` when
    // `addr` is the anchor itself, a plain cell, or an empty cell.
    // Used by the JS UI to draw the spill outline relative to the
    // anchor even when the anchor cell is outside the visible window.
}
