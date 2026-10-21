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
    /// zero-based inclusive ranges. `infer` derives parameters from native
    /// samples; otherwise explicit detector witnesses remain strictly validated.
    pub fn apply_auto_fill(&mut self, payload: JsValue) -> Result<JsValue, JsValue> {
        let request: AutoFillRequestJSON =
            serde_wasm_bindgen::from_value(payload).map_err(|err| {
                auto_fill_rejection(
                    AUTO_FILL_REJECTION_ERROR_CODE,
                    format!("invalid auto-fill request: {err}"),
                )
            })?;
        let infer = request.infer;
        let confirmed = match request.validation_confirmation.as_deref() {
            None => false,
            Some("continue") => true,
            _ => return Err(JsValue::from_str("INVALID_VALIDATION_CONFIRMATION")),
        };
        let request: AutoFillRequest = request.into();
        let automatic = infer && request.series == AutoFillSeries::Copy;
        let request = if infer && !automatic {
            self.workbook
                .infer_auto_fill_request(request)
                .map_err(|err| {
                    auto_fill_rejection(
                        auto_fill_error_code(&err),
                        format!("auto-fill rejected: {err}"),
                    )
                })?
        } else {
            request
        };
        let history = &mut self.history;
        let report = self.workbook.with_validation_confirmation(confirmed, |workbook| {
            if automatic { history.apply_inferred_auto_fill(workbook, &request) }
            else { history.apply_auto_fill(workbook, &request) }
        }).map_err(|err| {
            auto_fill_rejection(
                auto_fill_error_code(&err),
                format!("auto-fill rejected: {err}"),
            )
        })?;
        serde_wasm_bindgen::to_value(&AutoFillReportJSON::from(report))
            .map_err(|err| JsValue::from_str(&format!("serialize auto-fill report: {err}")))
    }

    /// 双击填充只返回原生判定的末行，不把相邻列值传给 JS 再扫描。
    pub fn find_fill_down_end(
        &self, sheet: u32, source: JsValue, row_limit: u32,
    ) -> Result<Option<u32>, JsValue> {
        let source: AutoFillRangeJSON = serde_wasm_bindgen::from_value(source)
            .map_err(|err| JsValue::from_str(&format!("invalid fill source: {err}")))?;
        self.workbook.find_fill_down_end(sheet as usize, source.into(), row_limit)
            .map_err(|err| auto_fill_rejection(auto_fill_error_code(&err), err.to_string()))
    }

    /// 兼容旧调用：把完整格式逐格写进 cellStyle。
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
        self.ensure_protection_range(sheet_idx, range)?;
        let sheet = self
            .workbook
            .sheet_mut(sheet_idx as usize)
            .ok_or_else(|| JsValue::from_str(&format!("invalid sheet index: {sheet_idx}")))?;
        Ok(sheet.set_format_range(range, parsed.into_format()) as u32)
    }

    /// 按属性写入 cellStyle / rowStyle / columnStyle。
    pub fn patch_format_range(
        &mut self,
        sheet_idx: u32,
        start_row: u32,
        start_col: u32,
        end_row: u32,
        end_col: u32,
        patch: JsValue,
        scope: &str,
    ) -> Result<u32, JsValue> {
        let parsed: CellFormatJSON = serde_wasm_bindgen::from_value(patch)
            .map_err(|e| JsValue::from_str(&format!("invalid CellStyle patch: {e}")))?;
        let range = CellRange::new(
            CellAddress::new(start_row, start_col),
            CellAddress::new(end_row, end_col),
        );
        self.history.patch_format_range(
            &mut self.workbook, sheet_idx as usize, range, style_scope(scope)?, parsed.into_style(),
        ).map(|count| count as u32).map_err(JsValue::from_str)
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
        // 行列样式与跨格边框也可在快照内，不能只检查可见 cellStyle。
        self.ensure_protection_sheet(sheet_idx)?;
        let sheet = self
            .workbook
            .sheet_mut(sheet_idx as usize)
            .ok_or_else(|| JsValue::from_str(&format!("invalid sheet index: {sheet_idx}")))?;
        Ok(sheet.restore_format_range_snapshot(snapshot) as u32)
    }

    // Persist a sparse row-height fact on a workbook sheet. Empty rows are not
}
