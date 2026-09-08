impl WasmWorkbook {
    fn snapshot_sparse_cells(&self) -> Vec<SparseCellJSON> {
        let mut out = Vec::new();
        for sheet_idx in 0..self.workbook.sheet_count() {
            let Some(sheet) = self.workbook.sheet(sheet_idx) else {
                continue;
            };
            sheet.for_each_non_empty(|addr| {
                if let Some(cell) = sparse_cell_from_sheet_no_eval(sheet_idx, sheet, addr) {
                    out.push(cell);
                }
            });
        }
        out
    }

    fn snapshot_range_sparse_cells(
        &self,
        sheet_idx: u32,
        start_row: u32,
        start_col: u32,
        end_row: u32,
        end_col: u32,
    ) -> Vec<SparseCellJSON> {
        let sheet_idx = sheet_idx as usize;
        let range = CellRange::new(
            CellAddress::new(start_row, start_col),
            CellAddress::new(end_row, end_col),
        );
        let mut out = Vec::new();
        if let Some(sheet) = self.workbook.sheet(sheet_idx) {
            sheet.for_each_non_empty_in_range(range, |addr| {
                if let Some(cell) = sparse_cell_from_sheet_no_eval(sheet_idx, sheet, addr) {
                    out.push(cell);
                }
            });
        }
        out
    }

    fn full_sheet_range() -> CellRange {
        CellRange::new(CellAddress::new(0, 0), CellAddress::new(u32::MAX, u32::MAX))
    }

    fn restore_sparse_cells(&mut self, cells: Vec<SparseCellJSON>) -> u32 {
        let sheet_count = self.workbook.sheet_count();
        let mut restored = 0u32;
        self.workbook.bulk_load(|loader| {
            for cell in cells {
                if cell.sheet >= sheet_count {
                    continue;
                }
                // Typed loader entries (A-9 follow-up): the record already
                // holds row/col, so no `to_string_repr` → re-parse round
                // trip per cell.
                let addr = CellAddress::new(cell.row, cell.col);
                match cell.kind.as_str() {
                    "number" => {
                        if let Some(ImportValueJSON::Number(n)) = cell.value {
                            if n.is_finite() {
                                loader.set_cell_at(cell.sheet, addr, Value::Number(n));
                                restored += 1;
                            }
                        }
                    }
                    "text" => {
                        if let Some(ImportValueJSON::Text(s)) = cell.value {
                            loader.set_cell_at(cell.sheet, addr, Value::Text(s));
                            restored += 1;
                        }
                    }
                    "boolean" => {
                        if let Some(ImportValueJSON::Boolean(b)) = cell.value {
                            loader.set_cell_at(cell.sheet, addr, Value::Boolean(b));
                            restored += 1;
                        }
                    }
                    "error" => {
                        if let Some(ImportValueJSON::Text(s)) = cell.value {
                            loader.set_cell_at(
                                cell.sheet,
                                addr,
                                Value::Error(value_error_from_display(&s)),
                            );
                            restored += 1;
                        }
                    }
                    "formula" => {
                        if let Some(ImportValueJSON::Text(s)) = cell.value {
                            if loader.set_formula_at(cell.sheet, addr, &s) {
                                restored += 1;
                            }
                        }
                    }
                    "null" => {
                        loader.clear_cell_at(cell.sheet, addr);
                        restored += 1;
                    }
                    _ => {}
                }
            }
        });
        restored
    }
}

// Group sparse cell records into the per-sheet primitive/formula maps
// `Workbook::install_workbook_bulk` consumes (audit B-1 / W2.3). The
// twin of the JS-side 6.3 conversion in `worker-runtime.ts`
// (`buildBulkInstallPayload`) and the `bulk_install_workbook` wire
// deserializer, for callers that already hold typed `SparseCellJSON`
// records.
//
// Returns `(payload, restored)` where `restored` counts records that
// passed validation — matching the legacy loader's per-record count.
// Semantics notes (fresh-shell callers only):
// - records for out-of-range sheets are skipped, like the legacy path;
// - LAST record wins per address (a later record overwrites an earlier
//   one across both maps, mirroring loader write order);
// - `"null"` records clear the address from both maps. On the fresh
//   shell this is a no-op unless an earlier record wrote the address;
// - a malformed formula parks as source text and surfaces `#VALUE!` on
//   first read (the legacy loader wrote `#VALUE!` eagerly — same
//   observable value, deferred).
