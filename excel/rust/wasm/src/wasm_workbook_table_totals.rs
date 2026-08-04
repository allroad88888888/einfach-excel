#[wasm_bindgen]
impl WasmWorkbook {
    #[wasm_bindgen(js_name = "setTableTotalsRow")]
    pub fn set_table_totals_row(&mut self, name: &str, enabled: bool) -> Result<(), JsValue> {
        self.workbook
            .set_table_totals_row(name, enabled)
            .map_err(table_error_to_js)
    }

    /// Set one totals-row column's aggregate (design doc #32 §7). `func` is a
    /// camelCase id: `"none"` (clears the cell) / `"average"` / `"count"`
    /// (COUNTA) / `"countNums"` (COUNT) / `"max"` / `"min"` / `"sum"` /
    /// `"stdDev"` / `"var"`. Non-`none` ids write `=SUBTOTAL(1xx, Table[Col])`
    /// with the 101-111 hidden-excluding code. Requires the totals row to be
    /// enabled first (`"no-totals-row"` otherwise); unknown `func` yields
    /// `"invalid-totals-function"`.
    #[wasm_bindgen(js_name = "setTableTotalFunction")]
    pub fn set_table_total_function(
        &mut self,
        name: &str,
        column: &str,
        func: &str,
    ) -> Result<(), JsValue> {
        let parsed = TotalsFunction::from_id(func)
            .ok_or_else(|| JsValue::from_str("invalid-totals-function"))?;
        self.workbook
            .set_table_total_function(name, column, parsed)
            .map_err(table_error_to_js)
    }

    pub fn clear_cell(&mut self, sheet_idx: u32, addr: &str) {
        self.workbook.clear_cell(sheet_idx as usize, addr);
    }

    // Structural ops route through the WORKBOOK wrappers (not
    // `sheet_mut(..).insert_row`) so registered Excel Tables anchored to the
    // sheet follow the edit and their `tables_epoch` fires (design doc #32
    // §4.3 item c). For a table-less workbook these wrappers are behaviorally
    // identical to the old direct-sheet path.
    pub fn insert_row(&mut self, sheet_idx: u32, at: u32, count: u32) {
        self.workbook.insert_rows(sheet_idx as usize, at, count);
    }

    pub fn delete_row(&mut self, sheet_idx: u32, at: u32, count: u32) {
        self.workbook.delete_rows(sheet_idx as usize, at, count);
    }

    pub fn insert_col(&mut self, sheet_idx: u32, at: u32, count: u32) {
        self.workbook.insert_columns(sheet_idx as usize, at, count);
    }

    pub fn delete_col(&mut self, sheet_idx: u32, at: u32, count: u32) {
        self.workbook.delete_columns(sheet_idx as usize, at, count);
    }

    pub fn get_display(&self, sheet_idx: u32, addr: &str) -> String {
        let val = self.workbook_value(sheet_idx, addr);
        value_to_display(&val)
    }

    pub fn get_number(&self, sheet_idx: u32, addr: &str) -> f64 {
        // Funnel through `collapse_array_for_js` so spill anchors return
        // their [0][0] element instead of NaN at the JS boundary.
        match collapse_array_for_js(&self.workbook_value(sheet_idx, addr)).into_owned() {
            Value::Number(n) => n,
            _ => f64::NAN,
        }
    }

    pub fn get_type(&self, sheet_idx: u32, addr: &str) -> String {
        value_to_cell_type(&self.workbook_value(sheet_idx, addr))
    }

    pub fn is_error(&self, sheet_idx: u32, addr: &str) -> bool {
        self.workbook_value(sheet_idx, addr).is_error()
    }

    /// Workbook variant of `WasmSheet::spill_info`. See that method for
    /// JS-side semantics. Returns `null` for an unknown sheet index.
    #[wasm_bindgen(js_name = "spillInfo")]
    pub fn spill_info(&self, sheet_idx: u32, addr: &str) -> JsValue {
        let Some(parsed) = CellAddress::parse(addr) else {
            return JsValue::null();
        };
        let Some(sheet) = self.workbook.sheet(sheet_idx as usize) else {
            return JsValue::null();
        };
        match sheet.spill_info(parsed) {
            Some((rows, cols)) => {
                let arr = js_sys::Uint32Array::new_with_length(2);
                arr.copy_from(&[rows, cols]);
                arr.into()
            }
            None => JsValue::null(),
        }
    }

    pub fn get_formula(&self, sheet_idx: u32, addr: &str) -> String {
        self.workbook
            .sheet(sheet_idx as usize)
            .and_then(|sheet| sheet.get_formula(addr))
            .unwrap_or_default()
    }

    /// Snapshot display/type/error/formula for a single cell with one
    /// workbook read. Worker hydration uses this to avoid evaluating a dirty
    /// formula once for display, again for type, and again for error state.
    #[wasm_bindgen(js_name = "snapshotCell")]
    pub fn snapshot_cell(&self, sheet_idx: u32, addr: &str) -> Result<JsValue, JsValue> {
        let sheet_idx_usize = sheet_idx as usize;
        let value = self.workbook_value(sheet_idx, addr);
        let formula = self
            .workbook
            .sheet(sheet_idx_usize)
            .and_then(|sheet| sheet.get_formula(addr))
            .unwrap_or_default();
        let addr = CellAddress::parse(addr)
            .map(|addr| addr.to_string())
            .unwrap_or_else(|| addr.to_ascii_uppercase());
        serde_wasm_bindgen::to_value(&CellSnapshotJSON {
            sheet: sheet_idx_usize,
            addr,
            display: value_to_display(&value),
            cell_type: value_to_cell_type(&value),
            is_error: value.is_error(),
            formula,
        })
        .map_err(|err| JsValue::from_str(&format!("serialize cell snapshot: {err}")))
    }

    pub fn debug_formula_cache_state(&self, sheet_idx: u32, addr: &str) -> String {
        self.workbook
            .debug_formula_cache_state(sheet_idx as usize, addr)
            .to_string()
    }

    /// Total formula evaluations performed across all workbook sheets since
    /// creation. Uses each sheet's `debug_formula_eval_count` without
    /// evaluating any formulas.
    pub fn debug_formula_eval_count_total(&self) -> u32 {
        let mut total = 0usize;
        for idx in 0..self.workbook.sheet_count() {
            total += self.workbook.debug_formula_eval_count(idx);
        }
        total as u32
    }

    /// Total formula records currently registered across all workbook sheets.
    /// This is a read-only aggregate, not a cell visit across sparse content.
    pub fn debug_formula_count(&self) -> u32 {
        (0..self.workbook.sheet_count())
            .map(|idx| {
                self.workbook
                    .sheet(idx)
                    .map(|sheet| sheet.debug_formula_count())
                    .unwrap_or(0)
            })
            .sum::<usize>() as u32
    }

    /// Total number of live workbook subscription tokens currently held
    /// in the workbook bookkeeping map.
    pub fn debug_live_subscription_count(&self) -> u32 {
        self.subscriptions.len() as u32
    }

    /// Number of live `Sheet` listeners for a specific sheet. This
    /// includes only currently subscribed addresses and maps to the same
    /// contract as `Sheet::debug_live_subscription_count`.
    pub fn debug_sheet_live_subscription_count(&self, sheet_idx: u32) -> u32 {
        self.workbook
            .sheet(sheet_idx as usize)
            .map(|sheet| sheet.debug_live_subscription_count())
            .unwrap_or(0) as u32
    }

    /// Number of formula records currently registered on one workbook sheet.
    /// Returns `0` for missing sheet indexes.
    pub fn debug_sheet_formula_count(&self, sheet_idx: u32) -> u32 {
        self.workbook
            .sheet(sheet_idx as usize)
            .map(|sheet| sheet.debug_formula_count())
            .unwrap_or(0) as u32
    }

    /// Total formula evaluations performed on one workbook sheet since
    /// creation. Used by worker-backed lazy import/read tests.
    pub fn debug_formula_eval_count(&self, sheet_idx: u32) -> u32 {
        self.workbook.debug_formula_eval_count(sheet_idx as usize) as u32
    }

    // === Phase 3 / Track K — workbook mutators ===
    //
    // These mirror `WasmSheet::set_*` / `clear_cell` / `set_formula` but
    // take an explicit `sheet_idx`. They are the JS-facing entry points
    // for Phase 3's "writes go through Workbook" architecture (see
    // `excel/rust/docs/PHASE3_PARALLEL.md` § Architectural Decision).
    //
    // Phase 5 Track A: the legacy JS-facing `set_number` / `set_text` /
    // `set_boolean` / `set_error` / `clear_cell` methods above now route
    // through the same workbook-aware mutators as these canonical aliases.
    // Keep the aliases for new worker code and future generated bindings;
    // keep the legacy names for existing demos/tests that already compile
    // against the older wasm-pack surface.

    // Set a cell to a numeric value through the workbook. The shared Store
    // propagates local and cross-sheet formula dependencies and publishes
}
