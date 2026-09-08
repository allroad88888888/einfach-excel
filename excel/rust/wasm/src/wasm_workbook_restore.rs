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
        let print_configs =
            Self::print_config_snapshots_from_json(payload.print_configs, sheet_count)?;
        let conditional_formats =
            Self::conditional_format_snapshots_from_json(payload.conditional_formats, sheet_count)?;

        let mut workbook = Workbook::new();
        workbook.set_custom_function_registry(Some(
            self.custom_formulas.clone() as Arc<dyn CustomFunctionRegistry>
        ));
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
        let restored_print_configs = workbook
            .restore_print_configs(print_configs)
            .map_err(|error| format!("persistence restore print configs failed: {error}"))?
            as u32;
        let restored_conditional_formats = workbook
            .restore_conditional_formats(conditional_formats)
            .map_err(|error| format!("persistence restore conditional formats failed: {error}"))?
            as u32;
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
            workbook
                .install_workbook_bulk(install_payload)
                .map_err(|err| format!("persistence restore install failed: {err}"))?;
        }
        Self::restore_merges_json(&mut workbook, payload.merges)?;
        Self::restore_freeze_json(&mut workbook, payload.freeze)?;
        let mut restored_formats = 0u32;
        for (sheet_idx, snapshot) in format_snapshots {
            let sheet = workbook
                .sheet_mut(sheet_idx)
                .ok_or_else(|| format!("invalid sheet index: {sheet_idx}"))?;
            restored_formats += sheet.restore_format_range_snapshot(snapshot) as u32;
        }
        for (sheet_idx, row_heights, col_widths) in size_snapshots {
            let sheet = workbook
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
        let restored_tables = workbook
            .restore_tables(table_snapshot)
            .map_err(|err| format!("persistence restore tables failed: {}", table_error_id(err)))?
            as u32;
        // Hidden rows last as well, and for the same reason as the registry:
        // every sheet must exist first. REPLACE semantics are exact against
        // the fresh workbook, and entries for sheets the payload does not
        // contain are dropped by `restore_hidden` rather than failing here.
        let restored_hidden_sheets = workbook
            .restore_hidden(hidden_snapshot)
            .map_err(|_| "persistence restore hidden rows failed".to_string())?;

        // Filters last, for the same reason as the registry and the hidden
        // sets: every sheet must exist first. REPLACE is exact against the
        // fresh workbook, and it installs the REMEMBERED visibility rather
        // than re-running the predicate — a restore must not evaluate.
        let restored_filter_sheets = workbook
            .restore_filters(filter_snapshot)
            .map_err(|_| "persistence restore filters failed".to_string())?;

        let stats = WorkbookPersistenceRestoreStatsJSON {
            restored_cells,
            restored_formats,
            sheets: payload.sheets.len() as u32,
            restored_tables,
            restored_hidden_sheets,
            restored_filter_sheets,
            restored_print_configs,
            restored_conditional_formats,
        };
        // 所有内容及元数据都验证成功后才替换；旧历史/剪贴板不能写进新工作簿。
        self.subscriptions.clear();
        self.next_token = 0;
        self.workbook = workbook;
        self.history = Default::default();
        self.clipboard = None;
        Ok(stats)
    }
}
