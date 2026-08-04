impl WasmWorkbook {
    fn restore_persistence_v1_json(
        &mut self,
        payload: WorkbookPersistenceV1JSON,
    ) -> Result<WorkbookPersistenceRestoreStatsJSON, String> {
        if payload.version != 1 {
            return Err(format!(
                "unsupported persistence version: {}",
                payload.version
            ));
        }

        if payload.sheets.is_empty() {
            return Err("persistence payload has no sheets".into());
        }

        // No per-call payload cap. The cells route through the
        // storage-primary `install_workbook_bulk` (audit B-1 / W2.3):
        // per-sheet primitive/formula maps swap straight into the fresh
        // shell, formulas park as source text and hydrate lazily on
        // first read. See `STORAGE_PRIMARY_PLAN.md`.

        let mut seen_names = HashSet::new();
        for (idx, sheet) in payload.sheets.iter().enumerate() {
            if sheet.idx != idx as u32 {
                return Err(format!(
                    "sheet indices are not contiguous from 0: expected {idx}, got {}",
                    sheet.idx
                ));
            }
            if !seen_names.insert(sheet.name.clone()) {
                return Err(format!("duplicate sheet name in payload: {}", sheet.name));
            }
        }

        let sheet_count = payload.sheets.len();
        let mut format_snapshots = Vec::with_capacity(payload.formats.len());
        for snapshot in payload.formats {
            let sheet_idx = snapshot
                .sheet
                .ok_or_else(|| "format snapshot is missing sheet index".to_string())?
                as usize;
            if sheet_idx >= sheet_count {
                return Err(format!(
                    "format snapshot references missing sheet: {sheet_idx}"
                ));
            }
            let snapshot = snapshot
                .into_snapshot()
                .map_err(|_| "invalid format snapshot".to_string())?;
            format_snapshots.push((sheet_idx, snapshot));
        }

        let mut size_snapshots = Vec::with_capacity(payload.sizes.len());
        for snapshot in payload.sizes {
            let sheet_idx = snapshot
                .sheet
                .ok_or_else(|| "size snapshot is missing sheet index".to_string())?
                as usize;
            if sheet_idx >= sheet_count {
                return Err(format!(
                    "size snapshot references missing sheet: {sheet_idx}"
                ));
            }
            let (row_heights, col_widths) = snapshot.into_size_facts()?;
            size_snapshots.push((sheet_idx, row_heights, col_widths));
        }

        // Parse the Table registry BEFORE the workbook is swapped, so a
        // malformed range string joins the other reject-without-mutating
        // failures rather than stranding a half-restored workbook.
        let table_snapshot = Self::table_snapshot_from_json(payload.tables)?;
        let hidden_snapshot = Self::hidden_snapshot_from_json(payload.hidden);
        let filter_snapshot = Self::filter_snapshot_from_json(payload.filters);

        let mut workbook = Workbook::new();
        let first_name = payload.sheets[0].name.clone();
        let first_sheet_already_named = workbook.name(0) == Some(first_name.as_str());
        if !first_sheet_already_named && !workbook.rename_sheet(0, &first_name) {
            return Err(format!(
                "failed to initialize first sheet name: {}",
                first_name
            ));
        }
        for sheet in payload.sheets.iter().skip(1) {
            workbook.add_sheet(&sheet.name);
        }

        self.subscriptions.clear();
        self.next_token = 0;
        self.workbook = workbook;

        // W2.3 (audit B-1): fresh-shell restore is exactly the
        // full-sheet-replace shape `install_workbook_bulk` implements —
        // group the records into per-sheet primitive/formula maps and
        // install in ONE engine call. No per-cell loader ceremony, no
        // eager parse (the `!`-prefilter inside the install covers
        // cross-sheet edges), formulas hydrate lazily on first read.
        // Measured (bench_restore_persistence_v1_50k_plus_50k, native
        // release, 50k primitives + 50k formulas): legacy loader
        // 67.5 ms → 29.4 ms storage-primary (0.67 → 0.29 µs/cell); the
        // 6.x bench history puts the wasm32 multiplier higher still.
        let (install_payload, restored_cells) =
            sparse_cells_to_install_payload(payload.cells, sheet_count);
        if !install_payload.is_empty() {
            self.workbook
                .install_workbook_bulk(install_payload)
                .map_err(|err| format!("persistence restore install failed: {err}"))?;
        }
        let mut restored_formats = 0u32;
        for (sheet_idx, snapshot) in format_snapshots {
            let sheet = self
                .workbook
                .sheet_mut(sheet_idx)
                .ok_or_else(|| format!("invalid sheet index: {sheet_idx}"))?;
            restored_formats += sheet.restore_format_range_snapshot(snapshot) as u32;
        }
        for (sheet_idx, row_heights, col_widths) in size_snapshots {
            let sheet = self
                .workbook
                .sheet_mut(sheet_idx)
                .ok_or_else(|| format!("invalid sheet index: {sheet_idx}"))?;
            for (row_index, height_px) in row_heights {
                sheet.set_row_height(row_index, height_px);
            }
            for (col_index, width_px) in col_widths {
                sheet.set_col_width(col_index, width_px);
            }
        }

        // Registry last: entries anchor by sheet NAME, so every sheet must
        // already exist and be named. REPLACE semantics make this exact —
        // the fresh workbook starts empty, so restore installs precisely the
        // captured set.
        let restored_tables = self
            .workbook
            .restore_tables(table_snapshot)
            .map_err(|err| format!("persistence restore tables failed: {}", table_error_id(err)))?
            as u32;

        // Hidden rows last as well, and for the same reason as the registry:
        // every sheet must exist first. REPLACE semantics are exact against
        // the fresh workbook, and entries for sheets the payload does not
        // contain are dropped by `restore_hidden` rather than failing here.
        let restored_hidden_sheets = self
            .workbook
            .restore_hidden(hidden_snapshot)
            .map_err(|_| "persistence restore hidden rows failed".to_string())?;

        // Filters last, for the same reason as the registry and the hidden
        // sets: every sheet must exist first. REPLACE is exact against the
        // fresh workbook, and it installs the REMEMBERED visibility rather
        // than re-running the predicate — a restore must not evaluate.
        let restored_filter_sheets = self
            .workbook
            .restore_filters(filter_snapshot)
            .map_err(|_| "persistence restore filters failed".to_string())?;

        let stats = WorkbookPersistenceRestoreStatsJSON {
            restored_cells,
            restored_formats,
            sheets: payload.sheets.len() as u32,
            restored_tables,
            restored_hidden_sheets,
            restored_filter_sheets,
        };
        Ok(stats)
    }

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
