// 计算不属于内容编辑，不打开历史事务；所有失效与依赖传播在 Rust 完成。
#[wasm_bindgen]
impl WasmWorkbook {
    pub fn recalculate(&mut self, sheet: Option<u32>) -> Result<usize, JsValue> {
        self.workbook
            .recalculate(sheet.map(|index| index as usize))
            .map_err(JsValue::from_str)
    }
}
