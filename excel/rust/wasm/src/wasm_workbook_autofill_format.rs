#[wasm_bindgen]
impl WasmWorkbook {
    pub fn clear_range(
        &mut self,
        sheet_idx: u32,
        start_row: u32,
        start_col: u32,
        end_row: u32,
        end_col: u32,
    ) -> u32 {
        let range = CellRange::new(
            CellAddress::new(start_row, start_col),
            CellAddress::new(end_row, end_col),
        );
        self.workbook.clear_range(sheet_idx as usize, range) as u32
    }

    /// Preflight and apply one native drag-fill atomically. The payload uses
    /// zero-based inclusive ranges and carries every detector witness needed
    /// to reject semantically inconsistent series requests.
    pub fn apply_auto_fill(&mut self, payload: JsValue) -> Result<JsValue, JsValue> {
        let request: AutoFillRequestJSON =
            serde_wasm_bindgen::from_value(payload).map_err(|err| {
                auto_fill_rejection(
                    AUTO_FILL_REJECTION_ERROR_CODE,
                    format!("invalid auto-fill request: {err}"),
                )
            })?;
        let report = self
            .workbook
            .apply_auto_fill(&request.into())
            .map_err(|err| {
                auto_fill_rejection(
                    auto_fill_error_code(&err),
                    format!("auto-fill rejected: {err}"),
                )
            })?;
        serde_wasm_bindgen::to_value(&AutoFillReportJSON::from(report))
            .map_err(|err| JsValue::from_str(&format!("serialize auto-fill report: {err}")))
    }

    /// Set a range format without materializing empty cells. The core stores
    /// a sparse range-format layer and only notifies addresses that are
    /// already subscribed.
    pub fn set_format_range(
        &mut self,
        sheet_idx: u32,
        start_row: u32,
        start_col: u32,
        end_row: u32,
        end_col: u32,
        fmt: JsValue,
    ) -> Result<u32, JsValue> {
        let parsed: CellFormatJSON = if fmt.is_undefined() || fmt.is_null() {
            CellFormatJSON::default()
        } else {
            serde_wasm_bindgen::from_value(fmt)
                .map_err(|e| JsValue::from_str(&format!("invalid CellFormat: {e}")))?
        };
        let range = CellRange::new(
            CellAddress::new(start_row, start_col),
            CellAddress::new(end_row, end_col),
        );
        let sheet = self
            .workbook
            .sheet_mut(sheet_idx as usize)
            .ok_or_else(|| JsValue::from_str(&format!("invalid sheet index: {sheet_idx}")))?;
        Ok(sheet.set_format_range(range, parsed.into_format()) as u32)
    }

    /// Snapshot sparse formatting metadata for a workbook sheet. The
    /// snapshot is metadata-only and safe for lazy formula caches.
    pub fn snapshot_format_range(
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
        let snapshot = sheet.snapshot_format_range(range);
        serde_wasm_bindgen::to_value(&FormatRangeSnapshotJSON::from_snapshot(
            &snapshot,
            Some(sheet_idx),
        ))
        .map_err(|err| JsValue::from_str(&format!("serialize format range snapshot: {err}")))
    }

    /// Restore a formatting snapshot produced by `snapshot_format_range`.
    pub fn restore_format_snapshot(&mut self, snapshot: JsValue) -> Result<u32, JsValue> {
        let snapshot: FormatRangeSnapshotJSON = serde_wasm_bindgen::from_value(snapshot)
            .map_err(|err| JsValue::from_str(&format!("invalid format range snapshot: {err}")))?;
        let sheet_idx = snapshot.sheet.unwrap_or(0);
        let snapshot = snapshot.into_snapshot()?;
        let sheet = self
            .workbook
            .sheet_mut(sheet_idx as usize)
            .ok_or_else(|| JsValue::from_str(&format!("invalid sheet index: {sheet_idx}")))?;
        Ok(sheet.restore_format_range_snapshot(snapshot) as u32)
    }

    // Persist a sparse row-height fact on a workbook sheet. Empty rows are not
}
