// 计算不属于内容编辑，不打开历史事务；所有失效与依赖传播在 Rust 完成。
#[wasm_bindgen]
impl WasmWorkbook {
    pub fn recalculate(&mut self, sheet: Option<u32>) -> Result<usize, JsValue> {
        self.workbook
            .recalculate(sheet.map(|index| index as usize))
            .map_err(JsValue::from_str)
    }

    pub fn get_calculation_mode(&self) -> String {
        match self.workbook.calculation_mode() {
            einfach_excel_core::CalculationMode::Automatic => "automatic".to_owned(),
            einfach_excel_core::CalculationMode::Manual => "manual".to_owned(),
        }
    }

    pub fn set_calculation_mode(&mut self, mode: &str) -> Result<bool, JsValue> {
        if self.workbook.is_inside_custom_call() {
            return Err(JsValue::from_str(
                "Cannot change calculation mode inside a custom-formula callback.",
            ));
        }
        let parsed = match mode {
            "automatic" => einfach_excel_core::CalculationMode::Automatic,
            "manual" => einfach_excel_core::CalculationMode::Manual,
            _ => return Err(JsValue::from_str("Unknown calculation mode.")),
        };
        Ok(self.workbook.set_calculation_mode(parsed))
    }
}
