#[wasm_bindgen]
impl WasmSheet {
    pub fn set_format(&mut self, addr: &str, fmt: JsValue) -> Result<(), JsValue> {
        let parsed: CellFormatJSON = if fmt.is_undefined() || fmt.is_null() {
            CellFormatJSON::default()
        } else {
            serde_wasm_bindgen::from_value(fmt)
                .map_err(|e| JsValue::from_str(&format!("invalid CellFormat: {e}")))?
        };
        self.sheet.set_format(addr, parsed.into_format());
        Ok(())
    }

    /// Phase 6 — set the format for a rectangular range.
    /// `fmt` follows the same wire shape as `set_format`; `null` / `undefined` / `{}` clears
    /// any non-default range style by storing the default style as a layer.
    pub fn set_format_range(
        &mut self,
        start_row: u32,
        start_col: u32,
        end_row: u32,
        end_col: u32,
        fmt: JsValue,
    ) -> Result<u32, JsValue> {
        let parsed: CellFormatJSON = if fmt.is_undefined() || fmt.is_null() {
            CellFormatJSON::default()
        } else {
            serde_wasm_bindgen::from_value(fmt)
                .map_err(|e| JsValue::from_str(&format!("invalid CellFormat: {e}")))?
        };
        let range = CellRange::new(
            CellAddress::new(start_row, start_col),
            CellAddress::new(end_row, end_col),
        );
        Ok(self.sheet.set_format_range(range, parsed.into_format()) as u32)
    }

    /// Snapshot sparse formatting metadata for undoing a later range-format
    /// edit. Does not read cell values or materialize empty cells.
    pub fn snapshot_format_range(
        &self,
        start_row: u32,
        start_col: u32,
        end_row: u32,
        end_col: u32,
    ) -> Result<JsValue, JsValue> {
        let range = CellRange::new(
            CellAddress::new(start_row, start_col),
            CellAddress::new(end_row, end_col),
        );
        let snapshot = self.sheet.snapshot_format_range(range);
        serde_wasm_bindgen::to_value(&FormatRangeSnapshotJSON::from_snapshot(&snapshot, None))
            .map_err(|err| JsValue::from_str(&format!("serialize format range snapshot: {err}")))
    }

    /// Restore metadata produced by `snapshot_format_range`.
    pub fn restore_format_snapshot(&mut self, snapshot: JsValue) -> Result<u32, JsValue> {
        let snapshot: FormatRangeSnapshotJSON = serde_wasm_bindgen::from_value(snapshot)
            .map_err(|err| JsValue::from_str(&format!("invalid format range snapshot: {err}")))?;
        let snapshot = snapshot.into_snapshot()?;
        Ok(self.sheet.restore_format_range_snapshot(snapshot) as u32)
    }

    /// Read the base format for a cell (no conditional rules applied).
    pub fn get_format(&self, addr: &str) -> JsValue {
        let fmt = self.sheet.get_format(addr);
        serde_wasm_bindgen::to_value(&CellFormatJSON::from_format(&fmt))
            .unwrap_or(JsValue::UNDEFINED)
    }

    /// Read the effective format for a cell (base + first matching
    /// conditional rule override).
    pub fn get_effective_format(&self, addr: &str) -> JsValue {
        let fmt = self.sheet.effective_format(addr);
        serde_wasm_bindgen::to_value(&CellFormatJSON::from_format(&fmt))
            .unwrap_or(JsValue::UNDEFINED)
    }

    /// Format a cell's value using its effective format. Numeric cells go
    /// through `CellFormat::format_number`; non-numeric cells fall back to
    /// the default display path.
    ///
    /// The error case is intercepted here rather than delegated.
    /// `Sheet::formatted_display` re-implements the display match instead of
    /// calling `value_to_display`, so it renders `Value::Error` through the
    /// engine-internal `Display` and would leak `#TYPE!` / `#ARGS!` — codes
    /// Excel does not have — into this legacy shell's cell text. A number
    /// format can never apply to an error, so short-circuiting the error arm is
    /// behaviour-identical apart from the token map. This is a bridge, not
    /// the fix: the durable one is for `Sheet::formatted_display` to route
    /// its `Value::Error` arm through `error_display_token` too, at which
    /// point this arm becomes redundant (and harmless).
    pub fn formatted_display(&self, addr: &str) -> String {
        if let Some(parsed) = CellAddress::parse(addr) {
            // Collapse first: a spill anchor holds the whole `Value::Array`,
            // and the erroring element we care about is the top-left one
            // that the display boundary would show.
            if let Value::Error(err) = &*collapse_array_for_js(&self.sheet.peek_value(parsed)) {
                return einfach_excel_core::error_display_token(err).into_owned();
            }
        }
        self.sheet.formatted_display(addr)
    }

    // === B1 — debug counters mirror ===
    //
    // Thin wrappers that expose the Sheet-level `debug_*` counters across
    // the WASM boundary. Each returns `u32` so the JS side gets a plain
    // number; on 64-bit hosts the counters are `usize` but the values we
    // expect (eval counts, dirty counts, live sub counts) stay well under
    // 2^32 for any realistic test. Naming mirrors `debug_*` on `Sheet`.

    /// Total formula evaluations performed since this sheet was created.
    pub fn debug_formula_eval_count(&self) -> u32 {
        self.sheet.debug_formula_eval_count() as u32
    }

    /// Number of formula records currently in the `Dirty` cache state.
    pub fn debug_dirty_count(&self) -> u32 {
        self.sheet.debug_dirty_count() as u32
    }

    /// Number of formulas registered via `bulk_load` (cumulative).
    pub fn debug_imported_formula_count(&self) -> u32 {
        self.sheet.debug_imported_formula_count() as u32
    }

    /// Number of `CellAddress`es with at least one live listener.
    pub fn debug_live_subscription_count(&self) -> u32 {
        self.sheet.debug_live_subscription_count() as u32
    }

    /// Number of materialized Store geometry roots used by large range
    /// formulas. Small ranges depend on member facades and contribute zero.
    pub fn debug_range_dep_count(&self) -> u32 {
        self.sheet.debug_range_dep_count() as u32
    }
}
