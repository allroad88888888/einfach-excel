#[wasm_bindgen]
impl WasmWorkbook {
    pub fn set_row_height(&mut self, sheet_idx: u32, row_index: u32, height_px: u32) -> bool {
        let Some(sheet) = self.workbook.sheet_mut(sheet_idx as usize) else {
            return false;
        };
        if height_px == 0 {
            sheet.clear_row_height(row_index);
        } else {
            sheet.set_row_height(row_index, height_px);
        }
        true
    }

    /// Persist a sparse column-width fact on a workbook sheet. Empty columns are
    /// not materialized; this only updates sheet metadata.
    pub fn set_col_width(&mut self, sheet_idx: u32, col_index: u32, width_px: u32) -> bool {
        let Some(sheet) = self.workbook.sheet_mut(sheet_idx as usize) else {
            return false;
        };
        if width_px == 0 {
            sheet.clear_col_width(col_index);
        } else {
            sheet.set_col_width(col_index, width_px);
        }
        true
    }

    /// Snapshot row/column size metadata for the requested visible window.
    pub fn snapshot_viewport_sizes(
        &self,
        sheet_idx: u32,
        start_row: u32,
        start_col: u32,
        end_row: u32,
        end_col: u32,
    ) -> Result<JsValue, JsValue> {
        let range = CellRange::new(
            CellAddress::new(start_row, start_col),
            CellAddress::new(end_row, end_col),
        );
        let sheet = self
            .workbook
            .sheet(sheet_idx as usize)
            .ok_or_else(|| JsValue::from_str(&format!("invalid sheet index: {sheet_idx}")))?;
        serde_wasm_bindgen::to_value(&ViewportSizeSnapshotJSON::from_sheet_range(
            sheet,
            range,
            Some(sheet_idx),
        ))
        .map_err(|err| JsValue::from_str(&format!("serialize viewport size snapshot: {err}")))
    }

    /// Snapshot workbook state as persistence-v1 sparse envelope.
    ///
    /// Format metadata includes range-format and in-range cell formats from each
    /// sheet snapshot, but does not serialize any dense grid materialization.
    /// Formula cells are serialized using their source (`=...`), preserving lazy
    /// evaluation contracts during restore.
    pub fn snapshot_persistence_v1(&self) -> Result<JsValue, JsValue> {
        serde_wasm_bindgen::to_value(&self.snapshot_persistence_v1_json())
            .map_err(|err| JsValue::from_str(&format!("serialize persistence v1 snapshot: {err}")))
    }

    /// Restore a persistence-v1 sparse envelope into this workbook.
    ///
    /// Returns simple restore stats for quick assertions.
    pub fn restore_persistence_v1(&mut self, value: JsValue) -> Result<JsValue, JsValue> {
        let payload: WorkbookPersistenceV1JSON = serde_wasm_bindgen::from_value(value)
            .map_err(|err| JsValue::from_str(&format!("invalid persistence payload: {err}")))?;
        let stats = self
            .restore_persistence_v1_json(payload)
            .map_err(|err| JsValue::from_str(&err))?;
        serde_wasm_bindgen::to_value(&stats).map_err(|err| {
            JsValue::from_str(&format!("serialize persistence restore stats: {err}"))
        })
    }

    /// Physically sort a range (design-engine-sort S2). Payload:
    /// `{ range, keys: [{ col, direction, caseSensitive }], excludedRows }`
    /// where `range` is an A1 string or a zero-based bounds object. Returns
    /// the `SortRangeReport` witness on success and a structured
    /// `{ ok: false, code, anchor?, message? }` object for every rejection —
    /// engine gates (`invalid-range`, `empty-keys`, `key-out-of-range`,
    /// `spill-in-range`) and payload-parse failures (`invalid-payload`).
    /// The `Err` arm is reserved for a catastrophic report serialization.
    #[wasm_bindgen(js_name = "sortRange")]
    pub fn sort_range(&mut self, sheet_idx: u32, payload: JsValue) -> Result<JsValue, JsValue> {
        let payload: SortRangePayloadJSON = match serde_wasm_bindgen::from_value(payload) {
            Ok(payload) => payload,
            Err(err) => {
                return Ok(sort_error_to_js(
                    "invalid-payload",
                    None,
                    Some(&err.to_string()),
                ))
            }
        };
        let range = match payload.range.into_range() {
            Ok(range) => range,
            Err(msg) => return Ok(sort_error_to_js("invalid-payload", None, Some(&msg))),
        };
        let keys: Vec<SortKey> = payload
            .keys
            .into_iter()
            .map(SortKeyWireJSON::into_key)
            .collect();
        match self
            .workbook
            .sort_range(sheet_idx as usize, range, &keys, &payload.excluded_rows)
        {
            Ok(report) => serde_wasm_bindgen::to_value(&SortRangeReportJSON::from_report(&report))
                .map_err(|err| JsValue::from_str(&format!("serialize sort report: {err}"))),
            Err(err) => Ok(sort_range_error_to_js(err)),
        }
    }
}
