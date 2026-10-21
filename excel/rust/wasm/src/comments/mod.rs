// 批注只在 WASM 边界取浏览器本机时间；原生校验状态、权限、文本及历史。
include!("persistence.rs");

#[wasm_bindgen]
impl WasmWorkbook {
    pub fn read_comment(&self, sheet: u32, row: u32, col: u32) -> Result<String, JsValue> {
        if row >= 1_048_576 || col >= 16_384 {
            return Err(JsValue::from_str("The comment cell is outside the worksheet."));
        }
        let target = self.workbook.sheet(sheet as usize)
            .ok_or_else(|| JsValue::from_str("The comment worksheet no longer exists."))?;
        serde_json::to_string(&target.comment(CellAddress::new(row, col)))
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    pub fn change_comment(&mut self, sheet: u32, row: u32, col: u32,
        change_json: &str) -> Result<bool, JsValue> {
        let change = serde_json::from_str::<einfach_excel_core::comments::NativeCommentChange>(change_json)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        self.history.change_comment(&mut self.workbook, sheet as usize,
            CellAddress::new(row, col), change, js_sys::Date::now() as i64)
            .map_err(JsValue::from_str)
    }
}

#[cfg(test)]
mod comment_tests { include!("tests.rs"); }
