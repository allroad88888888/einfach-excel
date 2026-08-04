#[wasm_bindgen]
impl WasmWorkbook {
    #[wasm_bindgen(js_name = "bulkImportCellsInstrumented")]
    pub fn bulk_import_cells_instrumented(&mut self, cells: JsValue) -> Result<JsValue, JsValue> {
        use einfach_excel_core::bulk_import_trace::{
            run_bulk_import_with_phase_timings, BulkImportCellInput, BulkImportCellKind,
        };

        // ---- Phase: rpc_deserialize -----------------------------------
        // Measure the JsValue → Vec<WorkbookImportCellJSON> cost. This
        // is the post-postMessage half of the "RPC boundary" — the JS
        // side measures the wall-clock from call → return and the
        // difference (wall − engine_total − deserialize − parse_only)
        // approximates the structured-clone + wasm-bindgen marshaling
        // overhead that this method does NOT cover.
        let t_de_start = js_sys::Date::now();
        let raw_cells: Vec<WorkbookImportCellJSON> = serde_wasm_bindgen::from_value(cells)
            .map_err(|err| JsValue::from_str(&format!("invalid import cells: {err}")))?;
        let t_de_end = js_sys::Date::now();
        let rpc_deserialize_ms = t_de_end - t_de_start;

        // ---- Normalize raw cells → typed engine inputs ----------------
        // Off the timer: this is per-cell validation that does NOT
        // belong to any engine phase. The cost is roughly proportional
        // to cell_count but doesn't fluctuate with workbook size, so
        // omitting it from the breakdown is safe.
        let sheet_count = self.workbook.sheet_count();
        let mut inputs: Vec<BulkImportCellInput> = Vec::with_capacity(raw_cells.len());
        for cell in raw_cells.into_iter() {
            let kind_str = match &cell.kind {
                BulkImportKindJSON::Text(k) => k.clone(),
                BulkImportKindJSON::Invalid => continue,
            };
            if cell.sheet >= sheet_count {
                continue;
            }
            // Coordinates come pre-validated by the JS host (row/col are
            // u32); we just wrap them. No string round-trip needed.
            let addr = CellAddress::new(cell.row, cell.col);
            let mapped = match kind_str.as_str() {
                "number" => match &cell.value {
                    Some(BulkImportValueJSON::Number(n)) if n.is_finite() => {
                        Some(BulkImportCellKind::Number(*n))
                    }
                    _ => None,
                },
                "text" => match &cell.value {
                    Some(BulkImportValueJSON::Text(s)) => Some(BulkImportCellKind::Text(s.clone())),
                    _ => None,
                },
                "boolean" => match &cell.value {
                    Some(BulkImportValueJSON::Boolean(b)) => Some(BulkImportCellKind::Boolean(*b)),
                    _ => None,
                },
                "error" => match &cell.value {
                    Some(BulkImportValueJSON::Text(s)) => {
                        Some(BulkImportCellKind::Error(value_error_from_display(s)))
                    }
                    _ => None,
                },
                "formula" => match &cell.value {
                    Some(BulkImportValueJSON::Text(s)) => {
                        Some(BulkImportCellKind::Formula(s.clone()))
                    }
                    _ => None,
                },
                "null" => Some(BulkImportCellKind::Null),
                _ => None,
            };
            if let Some(k) = mapped {
                inputs.push(BulkImportCellInput {
                    sheet_idx: cell.sheet,
                    addr,
                    kind: k,
                });
            }
        }

        // ---- Phase: engine work (driver records its own phase split) -
        let timings =
            run_bulk_import_with_phase_timings(&mut self.workbook, &inputs, js_sys::Date::now);

        // ---- Stash for the debug accessor ------------------------------
        self.last_bulk_import_phase_ms.set(Some([
            timings.cell_count as f64,
            timings.formula_count as f64,
            rpc_deserialize_ms,
            timings.parse_only_ms,
            timings.set_cell_loop_ms,
            timings.set_formula_loop_ms,
            timings.flush_ms,
            timings.engine_total_ms,
            timings.flush_parse_ms,
            timings.flush_dep_extract_ms,
            timings.flush_dep_register_ms,
            timings.flush_formula_record_ms,
        ]));

        // ---- Return a thin success object (NOT the full stats wire) ---
        // Bench only needs to know the call succeeded; the breakdown is
        // read separately. Mirroring the full stats here would defeat the
        // purpose of isolating engine cost from serialize cost.
        Ok(JsValue::from_f64(timings.engine_total_ms))
    }

    // Read back the phase timings recorded by the most recent
    // [`Self::bulk_import_cells_instrumented`] call. Returns a flat
    // `Vec<f64>` indexed as:
    //
    // | Index | Field |
    // |---:|---|
    // | 0  | cell_count |
    // | 1  | formula_count |
    // | 2  | rpc_deserialize_ms |
    // | 3  | parse_only_ms |
    // | 4  | set_cell_loop_ms |
    // | 5  | set_formula_loop_ms |
    // | 6  | flush_ms |
    // | 7  | engine_total_ms |
    // | 8  | flush_parse_ms          (Phase 1 sub-slice of flush_ms) |
    // | 9  | flush_dep_extract_ms    (Phase 1 sub-slice of flush_ms) |
    // | 10 | flush_dep_register_ms   (Phase 1 sub-slice of flush_ms) |
    // | 11 | flush_formula_record_ms (Phase 1 sub-slice of flush_ms) |
    //
    // Indices [8..=11] are retained compatibility buckets that decompose
    // per-formula `install_parsed_formula` work inside the implicit flush.
    // The dependency-extract bucket now measures structural metadata and the
    // registration bucket stays near zero. Their sum should be no greater
    // than `flush_ms`; the remainder is Store propagation, structural work,
    // and subscriber dedup.
    //
    // Returns an empty `Vec<f64>` if no instrumented bulk import has
    // run yet on this workbook.
}
