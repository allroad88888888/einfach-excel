// 备注 WASM 入口只转发原生语义；文件和投影辅助代码属于同一功能目录。
include!("persistence.rs");

#[wasm_bindgen]
impl WasmWorkbook {
    pub fn read_note(&self, sheet: u32, row: u32, col: u32) -> Result<Option<String>, JsValue> {
        if row >= 1_048_576 || col >= 16_384 {
            return Err(JsValue::from_str("The note cell is outside the worksheet."));
        }
        let target = self
            .workbook
            .sheet(sheet as usize)
            .ok_or_else(|| JsValue::from_str("The note worksheet no longer exists."))?;
        Ok(target.note(CellAddress::new(row, col)).map(str::to_owned))
    }

    pub fn change_note(
        &mut self,
        sheet: u32,
        row: u32,
        col: u32,
        text: Option<String>,
    ) -> Result<bool, JsValue> {
        self.history
            .change_note(
                &mut self.workbook,
                sheet as usize,
                CellAddress::new(row, col),
                text.as_deref(),
            )
            .map_err(JsValue::from_str)
    }
}

#[cfg(test)]
mod note_tests {
    include!("tests.rs");
}
