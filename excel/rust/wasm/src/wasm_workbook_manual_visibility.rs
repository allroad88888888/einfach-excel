// 手动行列可见性由 Rust 持有；只把索引投影给页面，不以尺寸 0 代替隐藏。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SheetVisibilityJSON {
    manual_rows: Vec<u32>,
    manual_columns: Vec<u32>,
    filter_rows: Vec<u32>,
}

#[wasm_bindgen]
impl WasmWorkbook {
    /// 一次确认只产生一条原生历史；取消隐藏使用原范围，全表范围即恢复全部。
    pub fn set_visibility(
        &mut self,
        sheet: u32,
        start_row: u32,
        start_col: u32,
        end_row: u32,
        end_col: u32,
        action: &str,
    ) -> Result<bool, JsValue> {
        self.history
            .set_visibility(
                &mut self.workbook,
                sheet as usize,
                CellRange::new(
                    CellAddress::new(start_row, start_col),
                    CellAddress::new(end_row, end_col),
                ),
                action,
            )
            .map_err(JsValue::from_str)
    }

    /// 包括屏幕外索引，几何定位不依赖当前挂载的单元格。
    pub fn sheet_visibility(&self, sheet: u32) -> Result<JsValue, JsValue> {
        let state = self
            .workbook
            .sheet_visibility(sheet as usize)
            .map_err(JsValue::from_str)?;
        serde_wasm_bindgen::to_value(&SheetVisibilityJSON {
            manual_rows: state.rows,
            manual_columns: state.columns,
            filter_rows: self.workbook.filter_hidden_rows(sheet as usize),
        })
        .map_err(|error| JsValue::from_str(&error.to_string()))
    }
}
