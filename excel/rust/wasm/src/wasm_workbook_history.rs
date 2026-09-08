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
    sheet_key: String,
    sheet_name: String,
    sheet_change: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    structural_edit: Option<StructuralEditJSON>,
    affected_sheets: Vec<usize>,
    affected_sheet_keys: Vec<String>,
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
        if !matches!(direction, "undo" | "redo") {
            return Err(JsValue::from_str("Invalid history direction."));
        }
        let offset = if direction == "undo" {
            self.history.undo_count().checked_sub(1)
        } else {
            Some(self.history.undo_count())
        };
        let entry = offset.and_then(|offset| self.history.entries().nth(offset));
        let structural = entry.is_some_and(|entry| entry.is_sheet_change());
        let axes_changed = entry.is_some_and(|entry| entry.structural_edit().is_some());
        let removal = entry
            .filter(|entry| entry.removes_sheet(direction == "undo"))
            .map(|entry| (entry.sheet, entry.sheet_key));
        if let Some((index, key)) = removal {
            if self.workbook.sheet_key(index) != Some(key) || !self.prepare_sheet_removal(index) {
                return Err(JsValue::from_str(
                    "The worksheet cannot be removed by history.",
                ));
            }
        }
        let keys: Vec<_> = if structural {
            (0..self.workbook.sheet_count())
                .filter_map(|index| self.workbook.sheet_key(index))
                .collect()
        } else {
            Vec::new()
        };
        let changed = match direction {
            "undo" => self.history.undo(&mut self.workbook),
            "redo" => self.history.redo(&mut self.workbook),
            _ => Err("Invalid history direction."),
        }
        .map_err(JsValue::from_str)?;
        if changed && structural {
            self.remap_history_subscriptions(&keys);
        }
        if changed && (structural || axes_changed) {
            // 原剪贴板源可能指向已消失或改名的表；Worker 同步使其 token 失效并提示重新复制。
            self.clipboard = None;
        }
        Ok(changed)
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
                    sheet_key: entry.sheet_key.to_string(),
                    sheet_name: entry.sheet_name.clone(),
                    sheet_change: entry.is_sheet_change(),
                    structural_edit: entry.structural_edit().map(StructuralEditJSON::from),
                    affected_sheets: entry.affected_sheets(),
                    affected_sheet_keys: entry
                        .affected_keys
                        .iter()
                        .map(|key| key.to_string())
                        .collect(),
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
