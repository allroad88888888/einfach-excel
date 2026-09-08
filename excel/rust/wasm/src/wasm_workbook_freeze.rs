// 冻结数量沿用当前原生历史；绑定层不保存另一份视图配置。
#[wasm_bindgen]
impl WasmWorkbook {
    pub fn set_frozen_panes(&mut self, sheet: u32, rows: u32, cols: u32) -> Result<bool, JsValue> {
        self.history
            .set_frozen_panes(
                &mut self.workbook,
                sheet as usize,
                einfach_excel_core::FrozenPanes { rows, cols },
            )
            .map_err(JsValue::from_str)
    }

    /// 固定两个整数：[冻结行数, 冻结列数]，零表示该轴不冻结。
    pub fn frozen_panes(&self, sheet: u32) -> Result<Vec<u32>, JsValue> {
        let freeze = self
            .workbook
            .sheet(sheet as usize)
            .ok_or_else(|| JsValue::from_str("The worksheet no longer exists."))?
            .frozen_panes();
        Ok(vec![freeze.rows, freeze.cols])
    }
}
