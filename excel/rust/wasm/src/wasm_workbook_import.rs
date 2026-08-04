#[wasm_bindgen]
impl WasmWorkbook {
    pub fn bulk_import_cells(&mut self, cells: JsValue) -> Result<JsValue, JsValue> {
        // No per-call payload cap. The pre-Phase-2 path needed one to
        // dodge a WASM allocator panic on the eager formula-install
        // loop; the Phase 2/3 lazy `bulk_load` makes single-call 5M+
        // payloads finish cleanly. See `CAP_REMOVAL_2026-06-11.md`.
        let cells: Vec<WorkbookImportCellJSON> = serde_wasm_bindgen::from_value(cells)
            .map_err(|err| JsValue::from_str(&format!("invalid import cells: {err}")))?;

        let mut stats = WorkbookImportStatsJSON::default();
        let sheet_count = self.workbook.sheet_count();
        self.workbook.bulk_load(|loader| {
            for cell in cells {
                let kind = match &cell.kind {
                    BulkImportKindJSON::Text(kind) => kind.clone(),
                    BulkImportKindJSON::Invalid => {
                        stats.errors += 1;
                        stats.push_issue(&cell, "", "INVALID_KIND", "cell kind must be a string");
                        continue;
                    }
                };
                let kind = kind.as_str();
                if cell.sheet >= sheet_count {
                    stats.errors += 1;
                    stats.push_issue(
                        &cell,
                        kind,
                        "SHEET_OUT_OF_RANGE",
                        "cell sheet index is outside the workbook",
                    );
                    continue;
                }
                // Typed loader entries (A-9 follow-up): no per-cell
                // `to_string_repr` → re-parse round trip.
                let addr = CellAddress::new(cell.row, cell.col);
                match kind {
                    "number" => match &cell.value {
                        Some(BulkImportValueJSON::Number(n)) if n.is_finite() => {
                            loader.set_cell_at(cell.sheet, addr, Value::Number(*n));
                            stats.accepted += 1;
                        }
                        _ => {
                            stats.errors += 1;
                            stats.push_issue(
                                &cell,
                                kind,
                                "INVALID_VALUE",
                                "number cells require a numeric value",
                            );
                        }
                    },
                    "text" => match &cell.value {
                        Some(BulkImportValueJSON::Text(s)) => {
                            loader.set_cell_at(cell.sheet, addr, Value::Text(s.clone()));
                            stats.accepted += 1;
                        }
                        _ => {
                            stats.errors += 1;
                            stats.push_issue(
                                &cell,
                                kind,
                                "INVALID_VALUE",
                                "text cells require a string value",
                            );
                        }
                    },
                    "boolean" => match &cell.value {
                        Some(BulkImportValueJSON::Boolean(b)) => {
                            loader.set_cell_at(cell.sheet, addr, Value::Boolean(*b));
                            stats.accepted += 1;
                        }
                        _ => {
                            stats.errors += 1;
                            stats.push_issue(
                                &cell,
                                kind,
                                "INVALID_VALUE",
                                "boolean cells require a boolean value",
                            );
                        }
                    },
                    "error" => match &cell.value {
                        Some(BulkImportValueJSON::Text(s)) => {
                            loader.set_cell_at(
                                cell.sheet,
                                addr,
                                Value::Error(value_error_from_display(s)),
                            );
                            stats.accepted += 1;
                        }
                        _ => {
                            stats.errors += 1;
                            stats.push_issue(
                                &cell,
                                kind,
                                "INVALID_VALUE",
                                "error cells require a string value",
                            );
                        }
                    },
                    "formula" => match &cell.value {
                        Some(BulkImportValueJSON::Text(s)) => {
                            stats.formulas += 1;
                            if loader.set_formula_at(cell.sheet, addr, s) {
                                stats.accepted += 1;
                            } else {
                                stats.rejected_formulas += 1;
                                stats.push_issue(
                                    &cell,
                                    kind,
                                    "FORMULA_REJECTED",
                                    "formula was rejected by the workbook",
                                );
                            }
                        }
                        _ => {
                            stats.errors += 1;
                            stats.push_issue(
                                &cell,
                                kind,
                                "INVALID_VALUE",
                                "formula cells require a string value",
                            );
                        }
                    },
                    "null" => {
                        loader.clear_cell_at(cell.sheet, addr);
                        stats.accepted += 1;
                        stats.cleared += 1;
                    }
                    _ => {
                        stats.errors += 1;
                        stats.push_issue(&cell, kind, "INVALID_KIND", "cell kind is not supported");
                    }
                }
            }
        });

        serde_wasm_bindgen::to_value(&stats)
            .map_err(|err| JsValue::from_str(&format!("serialize import stats: {err}")))
    }

    // STORAGE_PRIMARY Phase 6.2: storage-primary bulk install. The
    // payload deserializes straight into the per-sheet
    // `HashMap<CellAddress, _>` maps and `Workbook::install_workbook_bulk`
    // swaps them into each sheet — no per-cell engine API calls, no
    // parse, no dep extraction, no ops queue. Formulas hydrate lazily
    // on first read.
    //
    // Wire shape (see `SheetBulkInstallJSON`) — the addr string is
    // `"R:C"` (zero-based) or A1 form; formula pair values are raw
    // source text:
    // ```ts
    // type WorkbookBulkPayload = Array<{
    //   sheet: number,
    //   primitives: Array<[string, number|string|boolean|null|{error:string}]>,
    //   formulas:   Array<[string, string]>,
    // }>
    // ```
    //
    // Returns `Array<{ sheet, primitivesInstalled, formulasInstalled,
    // crossSheetParsed }>`. `crossSheetParsed` is a compatibility field and
    // is always zero because Store evaluates parked formulas lazily. Each
    // listed sheet is fully REPLACED. The legacy `bulk_import_cells` path
    // stays available until Phase 6.4.
}
