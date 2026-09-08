// 历史快照不跨 WASM；只暴露可展示的目录以及原生撤销命令。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HistoryStateJSON {
    undo_count: usize,
    redo_count: usize,
    entries: Vec<HistoryEntryJSON>,
    notice: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HistoryEntryJSON {
    label: String,
    sheet_index: usize,
    affected_sheets: Vec<usize>,
    range: HistoryRangeJSON,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HistoryRangeJSON {
    row_start: u32,
    row_end: u32,
    col_start: u32,
    col_end: u32,
}

#[wasm_bindgen]
impl WasmWorkbook {
    pub fn history_begin(
        &mut self,
        sheet: u32,
        start_row: u32,
        start_col: u32,
        end_row: u32,
        end_col: u32,
        label: &str,
        content: bool,
    ) -> Result<(), JsValue> {
        self.history
            .begin(
                &self.workbook,
                sheet as usize,
                CellRange::new(
                    CellAddress::new(start_row, start_col),
                    CellAddress::new(end_row, end_col),
                ),
                label,
                content,
            )
            .map_err(JsValue::from_str)
    }

    pub fn history_finish(&mut self, success: bool) -> Result<(), JsValue> {
        self.history
            .finish(&mut self.workbook, success)
            .map_err(JsValue::from_str)
    }

    pub fn history_clear(&mut self, notice: &str) {
        self.history.clear(notice);
    }

    pub fn history_apply(&mut self, direction: &str) -> Result<bool, JsValue> {
        match direction {
            "undo" => self.history.undo(&mut self.workbook),
            "redo" => self.history.redo(&mut self.workbook),
            _ => Err("Invalid history direction."),
        }
        .map_err(JsValue::from_str)
    }

    pub fn history_state(&self) -> Result<JsValue, JsValue> {
        let state = HistoryStateJSON {
            undo_count: self.history.undo_count(),
            redo_count: self.history.redo_count(),
            notice: self.history.notice().map(str::to_owned),
            entries: self
                .history
                .entries()
                .map(|entry| HistoryEntryJSON {
                    label: entry.label.clone(),
                    sheet_index: entry.sheet,
                    affected_sheets: entry.affected_sheets(),
                    range: HistoryRangeJSON {
                        row_start: entry.range.start.row,
                        row_end: entry.range.end.row,
                        col_start: entry.range.start.col,
                        col_end: entry.range.end.col,
                    },
                })
                .collect(),
        };
        serde_wasm_bindgen::to_value(&state).map_err(|e| JsValue::from_str(&e.to_string()))
    }
}
