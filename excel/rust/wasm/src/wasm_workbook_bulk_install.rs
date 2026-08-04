#[wasm_bindgen]
impl WasmWorkbook {
    pub fn bulk_install_workbook(&mut self, payload: JsValue) -> Result<JsValue, JsValue> {
        let sheets: Vec<SheetBulkInstallJSON> = serde_wasm_bindgen::from_value(payload)
            .map_err(|err| JsValue::from_str(&format!("invalid bulk install payload: {err}")))?;

        let sheet_indexes: Vec<usize> = sheets.iter().map(|s| s.sheet).collect();
        let engine_payload: Vec<(
            usize,
            HashMap<CellAddress, Value>,
            HashMap<CellAddress, String>,
        )> = sheets
            .into_iter()
            .map(|s| (s.sheet, s.primitives.0, s.formulas.0))
            .collect();

        let stats = self
            .workbook
            .install_workbook_bulk(engine_payload)
            .map_err(|err| JsValue::from_str(&format!("bulk install rejected: {err}")))?;

        let stats_json: Vec<BulkInstallStatsJSON> = sheet_indexes
            .into_iter()
            .zip(stats)
            .map(|(sheet, s)| BulkInstallStatsJSON {
                sheet,
                primitives_installed: s.primitives_installed as u32,
                formulas_installed: s.formulas_installed as u32,
                cross_sheet_parsed: s.cross_sheet_parsed as u32,
            })
            .collect();
        serde_wasm_bindgen::to_value(&stats_json)
            .map_err(|err| JsValue::from_str(&format!("serialize install stats: {err}")))
    }

    // **Instrumented variant** of [`Self::bulk_import_cells`]: same end
    // effect on the workbook, but records phase timings on the
    // `WasmWorkbook` that the host can read back via
    // `debug_last_bulk_import_phase_ms()`.
    //
    // Decomposition matches `bulk_import_trace::BulkImportPhaseTimings`
    // plus two extras measured here (deserialize / normalize cost):
    //
    // - `rpc_deserialize_ms`: `serde_wasm_bindgen::from_value` cost
    //   (the JS → Rust translation of the cells array). Combined with
    //   the host-side `postMessage` cost the bench measures, this
    //   gives the full "RPC boundary" picture.
    // - `parse_only_ms`: isolated parser-only pass across formula
    //   strings.
    // - `set_cell_loop_ms`: time the engine spent storing primitives.
    // - `set_formula_loop_ms`: time the engine spent installing formulas
    //   (parse, cycle check, structural metadata, and storage).
    // - `flush_ms`: implicit `WorkbookLoader::flush` (storage replay, shared
    //   Store propagation, structural maintenance, and subscriber dedup).
    //
    // **Behavior preservation**: the per-cell write ORDER differs from
    // the production `bulk_import_cells` (primitives first, then
    // formulas, instead of caller order). For the perf bench this is
    // fine because seed cells and formula cells live in disjoint
    // columns. Hosts that need order-preserving import MUST use
    // `bulk_import_cells`, not this instrumented variant.
    //
    // Invalid cells (bad kind / coords / value type) are silently
    // dropped here — the stats path is bypassed because this is a
    // debug-only entry point and the goal is to measure engine cost
    // over the WELL-FORMED batch. Hosts that want issue accounting
    // should call the non-instrumented variant.
}
