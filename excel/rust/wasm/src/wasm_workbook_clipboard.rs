use einfach_excel_core::clipboard::{ClipboardPasteMode, ClipboardPasteOptions};

/// 传输层只拿文本与尺寸；值、公式、有效格式快照始终留在 Rust。
#[derive(Serialize)]
struct ClipboardCaptureJSON {
    text: String,
    rows: u32,
    cols: u32,
    cut: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClipboardPastePolicyJSON {
    mode: Option<String>,
    selection: Option<ClipboardRangeJSON>,
    row_count: u32,
    col_count: u32,
    unlocked_ranges: Option<Vec<ClipboardRangeJSON>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClipboardRangeJSON {
    row_start: u32,
    row_end: u32,
    col_start: u32,
    col_end: u32,
}

#[wasm_bindgen]
impl WasmWorkbook {
    pub fn capture_clipboard(
        &mut self,
        sheet_idx: u32,
        start_row: u32,
        start_col: u32,
        end_row: u32,
        end_col: u32,
        cut: bool,
    ) -> Result<JsValue, JsValue> {
        let snapshot = self
            .workbook
            .capture_clipboard(
                sheet_idx as usize,
                CellRange::new(
                    CellAddress::new(start_row, start_col),
                    CellAddress::new(end_row, end_col),
                ),
                cut,
            )
            .map_err(JsValue::from_str)?;
        let result = serde_wasm_bindgen::to_value(&ClipboardCaptureJSON {
            text: snapshot.text().to_owned(),
            rows: snapshot.rows(),
            cols: snapshot.cols(),
            cut,
        })
        .map_err(|err| JsValue::from_str(&err.to_string()))?;
        self.clipboard = Some(snapshot);
        Ok(result)
    }

    /// 内部快照或外部 TSV 二选一。剪切只有成功落地后才消费快照。
    pub fn paste_clipboard(
        &mut self,
        sheet_idx: u32,
        row: u32,
        col: u32,
        text: &str,
        internal: bool,
        policy: JsValue,
    ) -> Result<Vec<u32>, JsValue> {
        let policy: ClipboardPastePolicyJSON = serde_wasm_bindgen::from_value(policy)
            .map_err(|_| JsValue::from_str("CLIPBOARD_INVALID_POLICY"))?;
        let mode = match policy.mode.as_deref().unwrap_or("all") {
            "all" => ClipboardPasteMode::All,
            "values" => ClipboardPasteMode::Values,
            "formats" => ClipboardPasteMode::Formats,
            _ => return Err(JsValue::from_str("CLIPBOARD_INVALID_MODE")),
        };
        let selection = policy
            .selection
            .map(|range| {
                CellRange::new(
                    CellAddress::new(range.row_start, range.col_start),
                    CellAddress::new(range.row_end, range.col_end),
                )
            })
            .unwrap_or_else(|| CellRange::single(CellAddress::new(row, col)));
        if selection.start != CellAddress::new(row, col) {
            return Err(JsValue::from_str("CLIPBOARD_INVALID_POLICY"));
        }
        let unlocked = policy.unlocked_ranges.map(|ranges| {
            ranges
                .into_iter()
                .map(|range| {
                    CellRange::new(
                        CellAddress::new(range.row_start, range.col_start),
                        CellAddress::new(range.row_end, range.col_end),
                    )
                })
                .collect::<Vec<_>>()
        });
        let external;
        let snapshot = if internal {
            self.clipboard
                .as_ref()
                .ok_or_else(|| JsValue::from_str("CLIPBOARD_EMPTY"))?
        } else {
            external = einfach_excel_core::clipboard::ClipboardSnapshot::from_tsv(text, mode)
                .map_err(JsValue::from_str)?;
            &external
        };
        let cut = snapshot.is_cut();
        let range = self
            .workbook
            .paste_clipboard(
                snapshot,
                sheet_idx as usize,
                &ClipboardPasteOptions {
                    selection,
                    mode,
                    row_count: policy.row_count,
                    col_count: policy.col_count,
                    unlocked_ranges: unlocked,
                },
            )
            .map_err(JsValue::from_str)?;
        if cut {
            self.clipboard = None;
        }
        Ok(vec![
            range.start.row,
            range.start.col,
            range.end.row,
            range.end.col,
        ])
    }
}
