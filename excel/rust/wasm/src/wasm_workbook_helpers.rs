impl WasmWorkbook {
    fn workbook_value(&self, sheet_idx: u32, addr: &str) -> Value {
        let Some(name) = self.workbook.name(sheet_idx as usize) else {
            return Value::Null;
        };
        self.workbook.get_cell(name, addr)
    }

    /// Resolve a sheet name to its 0-based index for the Table DTO. Used only
    /// by `listTables` / `getTable`, where the Table anchors by sheet name.
    fn sheet_index_by_name(&self, name: &str) -> Option<u32> {
        (0..self.workbook.sheet_count())
            .find(|&idx| self.workbook.name(idx) == Some(name))
            .map(|idx| idx as u32)
    }

    /// Every registered Table as a wire DTO. Shared by `listTables`,
    /// `snapshotTables`, and the persistence-v1 envelope.
    fn tables_json(&self) -> Vec<TableJSON> {
        self.workbook
            .list_tables()
            .into_iter()
            .map(|entry| {
                let idx = self.sheet_index_by_name(entry.sheet_name()).unwrap_or(0);
                TableJSON::from_entry(entry, idx)
            })
            .collect()
    }

    /// Parse a wire snapshot into the engine type. Separated from
    /// `restore_tables_json` so the persistence path can validate the payload
    /// BEFORE it swaps in a fresh workbook.
    fn table_snapshot_from_json(tables: Vec<TableJSON>) -> Result<TableRegistrySnapshot, String> {
        let entries = tables
            .into_iter()
            .map(TableJSON::into_entry)
            .collect::<Result<Vec<_>, _>>()?;
        Ok(TableRegistrySnapshot::from_entries(entries))
    }

    fn restore_tables_json(&mut self, payload: TableRegistrySnapshotJSON) -> Result<u32, String> {
        if payload.version != 1 {
            return Err("unsupported-snapshot-version".into());
        }
        let snapshot = Self::table_snapshot_from_json(payload.tables)?;
        self.workbook
            .restore_tables(snapshot)
            .map(|count| count as u32)
            .map_err(|err| table_error_id(err).to_string())
    }

    fn snapshot_persistence_v1_json(&self) -> WorkbookPersistenceV1JSON {
        let mut sheets = Vec::with_capacity(self.workbook.sheet_count());
        let mut formats = Vec::with_capacity(self.workbook.sheet_count());
        let mut sizes = Vec::new();

        for sheet_idx in 0..self.workbook.sheet_count() {
            let Some(sheet) = self.workbook.sheet(sheet_idx) else {
                continue;
            };

            let name = self
                .workbook
                .name(sheet_idx)
                .map(str::to_string)
                .unwrap_or_default();
            sheets.push(WorkbookPersistenceSheetMetaJSON {
                idx: sheet_idx as u32,
                name,
            });

            let snapshot = sheet.snapshot_format_range(Self::full_sheet_range());
            formats.push(FormatRangeSnapshotJSON::from_snapshot(
                &snapshot,
                Some(sheet_idx as u32),
            ));

            let size_snapshot = ViewportSizeSnapshotJSON::from_full_sheet(sheet, sheet_idx as u32);
            if !size_snapshot.is_empty() {
                sizes.push(size_snapshot);
            }
        }

        WorkbookPersistenceV1JSON {
            version: 1,
            sheets,
            cells: self.snapshot_sparse_cells(),
            formats,
            sizes,
            tables: self.tables_json(),
            hidden: self.hidden_rows_json(),
            filters: self.filters_json(),
        }
    }

    /// The engine-owned manual hidden sets as wire elements, shared by
    /// `snapshotHidden` and the persistence-v1 envelope.
    fn hidden_rows_json(&self) -> Vec<SheetHiddenRowsJSON> {
        self.workbook
            .snapshot_hidden()
            .sheets()
            .iter()
            .map(SheetHiddenRowsJSON::from_entry)
            .collect()
    }

    /// The engine-owned filter state as wire elements, shared by
    /// `snapshotFilters` and the persistence-v1 envelope.
    fn filters_json(&self) -> Vec<SheetFilterStateJSON> {
        self.workbook
            .snapshot_filters()
            .sheets()
            .iter()
            .map(SheetFilterStateJSON::from_entry)
            .collect()
    }

    fn filter_snapshot_from_json(filters: Vec<SheetFilterStateJSON>) -> FilterSnapshot {
        FilterSnapshot::from_sheets(
            filters
                .into_iter()
                .map(SheetFilterStateJSON::into_entry)
                .collect(),
        )
    }

    fn restore_filters_json(&mut self, payload: FilterSnapshotJSON) -> Result<u32, String> {
        if payload.version != 1 {
            return Err("unsupported-snapshot-version".into());
        }
        self.workbook
            .restore_filters(Self::filter_snapshot_from_json(payload.filters))
            .map_err(|_| "mutation-during-custom-call".to_string())
    }

    fn filter_result_to_js(
        result: Result<FilterApplyReport, FilterError>,
    ) -> Result<JsValue, JsValue> {
        match result {
            Ok(report) => serde_wasm_bindgen::to_value(&FilterApplyReportJSON {
                ok: true,
                hidden_rows: report.hidden_rows,
                scanned_rows: report.scanned_rows,
                predicate_cells: report.predicate_cells,
            })
            .map_err(|err| JsValue::from_str(&format!("serialize filter report: {err}"))),
            Err(err) => Ok(filter_error_to_js(err)),
        }
    }

    fn hidden_snapshot_from_json(hidden: Vec<SheetHiddenRowsJSON>) -> HiddenRowsSnapshot {
        HiddenRowsSnapshot::from_sheets(
            hidden
                .into_iter()
                .map(SheetHiddenRowsJSON::into_entry)
                .collect(),
        )
    }

    fn restore_hidden_json(&mut self, payload: HiddenRowsSnapshotJSON) -> Result<u32, String> {
        if payload.version != 1 {
            return Err("unsupported-snapshot-version".into());
        }
        self.workbook
            .restore_hidden(Self::hidden_snapshot_from_json(payload.hidden))
            .map_err(|_| "mutation-during-custom-call".to_string())
    }
}
