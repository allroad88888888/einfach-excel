#[wasm_bindgen]
impl WasmWorkbook {
    #[wasm_bindgen(js_name = "debugLastBulkImportPhaseMs")]
    pub fn debug_last_bulk_import_phase_ms(&self) -> Vec<f64> {
        match self.last_bulk_import_phase_ms.get() {
            Some(arr) => arr.to_vec(),
            None => Vec::new(),
        }
    }

    /// Atom-delegation diagnostics aggregated across every sheet. This is a
    /// measurement-only debug surface; hydrated formula/static-range metadata
    /// is O(formula_count), while the legacy point-fanout fields stay zero.
    ///
    /// Returns a JS object with these fields (camelCase):
    /// - `totalFormulaCount` — sum of `formula_cells.len()` over sheets
    /// - `totalPointDepEdges` — always zero; Store owns point dependencies
    /// - `totalRangeDepEntries` — materialized Store geometry roots
    /// - `maxFanout` / `avgFanout` — always zero; no address fanout index
    /// - `rangeFormulaCount` — hydrated formulas with static range metadata
    #[wasm_bindgen(js_name = "debugDepGraphStats")]
    pub fn debug_dep_graph_stats(&self) -> Result<JsValue, JsValue> {
        let mut total = DepGraphStatsJSON::default();
        for sheet_idx in 0..self.workbook.sheet_count() {
            let Some(sheet) = self.workbook.sheet(sheet_idx) else {
                continue;
            };
            let s: DepGraphStats = sheet.debug_dep_graph_stats();
            total.total_formula_count = total.total_formula_count.saturating_add(s.formula_count);
            total.total_point_dep_edges = total
                .total_point_dep_edges
                .saturating_add(s.total_point_dep_edges);
            total.total_range_dep_entries = total
                .total_range_dep_entries
                .saturating_add(s.total_range_dep_entries);
            if s.max_fanout > total.max_fanout {
                total.max_fanout = s.max_fanout;
            }
            total.range_formula_count = total
                .range_formula_count
                .saturating_add(s.range_formula_count);
        }
        total.avg_fanout = 0.0;
        serde_wasm_bindgen::to_value(&total)
            .map_err(|err| JsValue::from_str(&format!("serialize dep graph stats: {err}")))
    }

    /// List every address that has a primitive value or formula across
    /// the workbook. This is metadata-only and does not evaluate formulas.
    pub fn list_non_empty_cells(&self) -> Result<JsValue, JsValue> {
        let mut out = Vec::new();
        for sheet_idx in 0..self.workbook.sheet_count() {
            let Some(sheet) = self.workbook.sheet(sheet_idx) else {
                continue;
            };
            sheet.for_each_non_empty(|addr| {
                out.push(CellRefJSON {
                    sheet: sheet_idx,
                    addr: addr.to_string(),
                });
            });
        }
        serde_wasm_bindgen::to_value(&out)
            .map_err(|err| JsValue::from_str(&format!("serialize non-empty cells: {err}")))
    }

    /// Snapshot sparse workbook contents without reading formula values.
    ///
    /// Formula cells serialize their source (`kind: "formula"`) and do
    /// not call the eval path, so dirty formula caches stay dirty.
    pub fn snapshot_sparse(&self) -> Result<JsValue, JsValue> {
        let out = self.snapshot_sparse_cells();
        serde_wasm_bindgen::to_value(&out)
            .map_err(|err| JsValue::from_str(&format!("serialize sparse snapshot: {err}")))
    }

    /// Snapshot non-empty cells in a zero-based inclusive range without
    /// reading formula values. Formula cells serialize their source and stay
    /// dirty/uncomputed, so this is safe for large-range undo.
    pub fn snapshot_range_sparse(
        &self,
        sheet_idx: u32,
        start_row: u32,
        start_col: u32,
        end_row: u32,
        end_col: u32,
    ) -> Result<JsValue, JsValue> {
        let out =
            self.snapshot_range_sparse_cells(sheet_idx, start_row, start_col, end_row, end_col);
        serde_wasm_bindgen::to_value(&out)
            .map_err(|err| JsValue::from_str(&format!("serialize sparse range snapshot: {err}")))
    }

    /// Restore sparse cell records produced by `snapshot_sparse` or
    /// `snapshot_range_sparse`. Uses workbook bulk-load so formulas are
    /// reinstalled dirty and are not evaluated during restore.
    ///
    /// **Contract: ADDITIVE merge onto the live workbook** (audit B-7).
    /// There is no teardown and no subscription reset — records are
    /// applied on top of whatever the workbook already holds, and a
    /// `"null"`-kind record explicitly clears its cell. The legacy
    /// sheet-store relies on this for large-range-clear undo: it
    /// snapshots only the range's non-empty cells, clears, and undoes
    /// by restoring that sparse snapshot onto the live workbook.
    ///
    /// W2.3 (audit B-1) verdict: because of this additive contract,
    /// `restore_sparse` deliberately STAYS on the legacy per-cell
    /// `WorkbookLoader` path — the storage-primary
    /// `install_workbook_bulk` is a full-sheet REPLACE and would
    /// silently destroy unrelated live content. Routing it would need
    /// the additive install variant Phase 6.4 deferred. The fresh-shell
    /// restore (`restore_persistence_v1`) IS routed storage-primary.
    pub fn restore_sparse(&mut self, cells: JsValue) -> Result<u32, JsValue> {
        // Routes through `Workbook::bulk_load`, which Phase 2/3 made
        // lazy — see `CAP_REMOVAL_2026-06-11.md`. No per-call payload
        // cap is needed.
        let cells: Vec<SparseCellJSON> = serde_wasm_bindgen::from_value(cells)
            .map_err(|err| JsValue::from_str(&format!("invalid sparse cells: {err}")))?;
        Ok(self.restore_sparse_cells(cells))
    }

    /// Read non-empty cells in a zero-based inclusive range. This is an
    /// explicit read/export path, so formula cells in the range may be
    /// evaluated and promoted to clean cache state.
    pub fn read_sparse_range(
        &self,
        sheet_idx: u32,
        start_row: u32,
        start_col: u32,
        end_row: u32,
        end_col: u32,
    ) -> Result<JsValue, JsValue> {
        let sheet_idx = sheet_idx as usize;
        let range = CellRange::new(
            CellAddress::new(start_row, start_col),
            CellAddress::new(end_row, end_col),
        );
        let mut out = Vec::new();
        self.workbook
            .for_each_sparse_range_cell(sheet_idx, range, |addr, value| {
                let addr_str = addr.to_string();
                let formula = self
                    .workbook
                    .sheet(sheet_idx)
                    .and_then(|sheet| sheet.get_formula(&addr_str))
                    .unwrap_or_default();
                out.push(CellSnapshotJSON {
                    sheet: sheet_idx,
                    addr: addr_str,
                    display: value_to_display(&value),
                    cell_type: value_to_cell_type(&value),
                    is_error: value.is_error(),
                    formula,
                });
            });
        serde_wasm_bindgen::to_value(&out)
            .map_err(|err| JsValue::from_str(&format!("serialize sparse range: {err}")))
    }

    // Clear non-empty cells in a zero-based inclusive range. The Rust
    // core scans only sparse entries inside the range and does not
}
