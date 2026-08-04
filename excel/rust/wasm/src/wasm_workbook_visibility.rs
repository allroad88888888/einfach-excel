#[wasm_bindgen]
impl WasmWorkbook {
    #[wasm_bindgen(js_name = "setEvalHiddenRows")]
    pub fn set_eval_hidden_rows(&mut self, sheet_idx: u32, rows: Vec<u32>) {
        self.workbook
            .set_eval_hidden_rows(sheet_idx as usize, &rows);
    }

    /// Push the host's per-sheet FILTER-hidden row set as read-only evaluation
    /// input (`design-filter-hidden-rows` §6.5). Additive twin of
    /// `setEvalHiddenRows` — that method is unchanged — carrying the source
    /// distinction Excel's two SUBTOTAL layers need: `SUBTOTAL(1-11)` excludes
    /// THIS set but includes manually hidden rows, `SUBTOTAL(101-111)` excludes
    /// both. Same shape and contract as `setEvalHiddenRows`: `rows` is a
    /// `number[]` of 0-based row indices, full-replace, empty array clears,
    /// out-of-range `sheet_idx` is a silent no-op, never throws.
    #[wasm_bindgen(js_name = "setEvalFilterHiddenRows")]
    pub fn set_eval_filter_hidden_rows(&mut self, sheet_idx: u32, rows: Vec<u32>) {
        self.workbook
            .set_eval_filter_hidden_rows(sheet_idx as usize, &rows);
    }

    // --- Engine-owned MANUAL hidden rows (E2 of
    // `design-engine-hidden-rows.md`) --------------------------------------
    //
    // Additive. `setEvalHiddenRows` above keeps its exact signature and stays
    // the host's write path for now; these expose the state the engine has
    // begun to own, so a later slice can flip the host from "pusher" to
    // "caller" without another export-surface change.

    /// Mark `rows` (0-based) manually hidden on `sheetIdx`, additively.
    /// Returns whether anything changed. Out-of-range `sheetIdx` and rows
    /// that were already hidden are silent `false`s; never throws.
    #[wasm_bindgen(js_name = "hideRows")]
    pub fn hide_rows(&mut self, sheet_idx: u32, rows: Vec<u32>) -> bool {
        self.workbook.hide_rows(sheet_idx as usize, &rows)
    }

    /// Un-hide `rows` (0-based) on `sheetIdx`. Rows that were not hidden are
    /// ignored. Returns whether anything changed; never throws.
    #[wasm_bindgen(js_name = "unhideRows")]
    pub fn unhide_rows(&mut self, sheet_idx: u32, rows: Vec<u32>) -> bool {
        self.workbook.unhide_rows(sheet_idx as usize, &rows)
    }

    /// The manually hidden rows on `sheetIdx` as a `number[]`, ascending.
    /// Empty for an out-of-range sheet.
    #[wasm_bindgen(js_name = "listHiddenRows")]
    pub fn list_hidden_rows(&self, sheet_idx: u32) -> Vec<u32> {
        self.workbook.list_hidden_rows(sheet_idx as usize)
    }

    /// Capture every sheet's manually hidden rows as an undo before-image.
    /// Twin of `snapshotTables`: pure read, no epoch bump, whole-workbook
    /// REPLACE on the way back through `restoreHidden`. Sheets with nothing
    /// hidden are omitted.
    #[wasm_bindgen(js_name = "snapshotHidden")]
    pub fn snapshot_hidden(&self) -> Result<JsValue, JsValue> {
        serde_wasm_bindgen::to_value(&HiddenRowsSnapshotJSON {
            version: 1,
            hidden: self.hidden_rows_json(),
        })
        .map_err(|err| JsValue::from_str(&format!("serialize hidden snapshot: {err}")))
    }

    /// Replace every sheet's manually hidden rows with a `snapshotHidden`
    /// payload, returning how many sheets ended up with at least one hidden
    /// row. Restoring an empty `hidden` array CLEARS everything — that is the
    /// point of REPLACE, not a no-op. Entries for sheets that no longer exist
    /// are dropped silently. A restore that reproduces the current state
    /// fires no epoch and costs no recompute.
    #[wasm_bindgen(js_name = "restoreHidden")]
    pub fn restore_hidden(&mut self, value: JsValue) -> Result<u32, JsValue> {
        let payload: HiddenRowsSnapshotJSON = serde_wasm_bindgen::from_value(value)
            .map_err(|err| JsValue::from_str(&format!("invalid hidden snapshot: {err}")))?;
        self.restore_hidden_json(payload)
            .map_err(|err| JsValue::from_str(&err))
    }

    // --- Engine-owned FILTER (E3 of `design-engine-hidden-rows.md`) -------
    //
    // Additive. `setEvalFilterHiddenRows` above keeps its exact signature
    // and stays the host's write path for now; these expose the state the
    // engine has begun to own, so a later slice can flip the host from
    // "pusher" to "caller" without another export-surface change.
    //
    // All three commands follow the `sortRange` convention: success and
    // every rejection come back inside the `Ok` arm as a plain object
    // discriminated by `ok`, so a structured refusal is never a thrown
    // exception. Only a serialization failure throws.

    /// Apply `{ rules: ColumnFilterRule[] }` to `sheetIdx`: run the
    /// predicate ONCE and commit both the rules and the rows they hid.
    ///
    /// Returns `{ ok: true, hiddenRows, scannedRows, predicateCells }`, or
    /// `{ ok: false, code, message? }`. `code: "source-too-large"` is the
    /// engine-side twin of the adapter's `FILTER_SORT_SOURCE_TOO_LARGE` —
    /// the filter does NOT activate and nothing is truncated.
    ///
    /// Visibility is a SNAPSHOT taken here. Later cell edits do not move
    /// it; `reapplyFilter` is the refresh path.
    #[wasm_bindgen(js_name = "applyFilter")]
    pub fn apply_filter(&mut self, sheet_idx: u32, payload: JsValue) -> Result<JsValue, JsValue> {
        let payload: ApplyFilterPayloadJSON = match serde_wasm_bindgen::from_value(payload) {
            Ok(payload) => payload,
            Err(err) => {
                return Ok(sort_error_to_js(
                    "invalid-payload",
                    None,
                    Some(&err.to_string()),
                ))
            }
        };
        let rules: Vec<ColumnFilterRule> = payload
            .rules
            .into_iter()
            .map(ColumnFilterRuleJSON::into_rule)
            .collect();
        Self::filter_result_to_js(self.workbook.apply_filter(sheet_idx as usize, &rules))
    }

    /// `Data -> Reapply` (Excel `Ctrl+Alt+L`): re-run `sheetIdx`'s ALREADY
    /// COMMITTED rules against current cell values. Carries no rules of its
    /// own, so it can never change WHAT is filtered — only which rows
    /// currently satisfy it.
    #[wasm_bindgen(js_name = "reapplyFilter")]
    pub fn reapply_filter(&mut self, sheet_idx: u32) -> Result<JsValue, JsValue> {
        Self::filter_result_to_js(self.workbook.reapply_filter(sheet_idx as usize))
    }

    /// Drop `sheetIdx`'s filter — rules and derived rows both. Scan-free.
    #[wasm_bindgen(js_name = "clearFilter")]
    pub fn clear_filter(&mut self, sheet_idx: u32) -> Result<JsValue, JsValue> {
        Self::filter_result_to_js(self.workbook.clear_filter(sheet_idx as usize))
    }

    /// Read `sheetIdx`'s committed filter as
    /// `{ rules: ColumnFilterRule[], hiddenRows: number[] }`.
    ///
    /// A WHOLE-SHEET read, deliberately not window-bounded: a host has to
    /// know about hidden rows OUTSIDE the visible window to expand that
    /// window correctly, so answering with a windowed subset would be
    /// circular. Called on sheet activation and after a restore — never per
    /// frame, per scroll, or per revision.
    #[wasm_bindgen(js_name = "getFilter")]
    pub fn get_filter(&self, sheet_idx: u32) -> Result<JsValue, JsValue> {
        let sheet_idx = sheet_idx as usize;
        let entry = SheetFilterStateJSON {
            sheet: sheet_idx as u32,
            rules: self
                .workbook
                .filter_rules(sheet_idx)
                .iter()
                .map(ColumnFilterRuleJSON::from_rule)
                .collect(),
            hidden_rows: self.workbook.filter_hidden_rows(sheet_idx),
        };
        serde_wasm_bindgen::to_value(&entry)
            .map_err(|err| JsValue::from_str(&format!("serialize filter: {err}")))
    }

    /// Capture every sheet's filter state as an undo before-image. Twin of
    /// `snapshotHidden`: pure read, no epoch bump, whole-workbook REPLACE on
    /// the way back through `restoreFilters`. Sheets with no filter are
    /// omitted.
    #[wasm_bindgen(js_name = "snapshotFilters")]
    pub fn snapshot_filters(&self) -> Result<JsValue, JsValue> {
        serde_wasm_bindgen::to_value(&FilterSnapshotJSON {
            version: 1,
            filters: self.filters_json(),
        })
        .map_err(|err| JsValue::from_str(&format!("serialize filter snapshot: {err}")))
    }

    /// Replace every sheet's filter state with a `snapshotFilters` payload,
    /// returning how many sheets ended up with a filter. Restoring an empty
    /// `filters` array CLEARS everything — that is the point of REPLACE, not
    /// a no-op. Entries for sheets that no longer exist are dropped
    /// silently, and no predicate is re-run.
    #[wasm_bindgen(js_name = "restoreFilters")]
    pub fn restore_filters(&mut self, value: JsValue) -> Result<u32, JsValue> {
        let payload: FilterSnapshotJSON = serde_wasm_bindgen::from_value(value)
            .map_err(|err| JsValue::from_str(&format!("invalid filter snapshot: {err}")))?;
        self.restore_filters_json(payload)
            .map_err(|err| JsValue::from_str(&err))
    }

    // Toggle a Table's totals row (design doc #32 §7). `enabled == true`
    // grows the Table by one row and writes a default `=SUBTOTAL(109, …)`
    // (SUM) in the last column — unless the row below is occupied, which
    // rejects with `"totals-row-blocked"`. `enabled == false` clears the
    // totals cells and shrinks the Table. Idempotent per state.
}
