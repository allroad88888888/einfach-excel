// 计算不属于内容编辑，不打开历史事务；所有失效与依赖传播在 Rust 完成。
#[wasm_bindgen]
impl WasmWorkbook {
    pub fn suspend_calculation(&mut self) -> Result<u32, JsValue> {
        self.workbook.suspend_calculation().map_err(JsValue::from_str)
    }

    pub fn resume_calculation(&mut self) -> Result<u32, JsValue> {
        self.workbook.resume_calculation().map_err(JsValue::from_str)
    }

    pub fn calculation_suspension_depth(&self) -> u32 {
        self.workbook.calculation_suspension_depth()
    }
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

    pub fn get_iterative_calculation(&self) -> JsValue {
        let cfg = self.workbook.iterative_calculation();
        serde_wasm_bindgen::to_value(&IterativeCalculationJSON {
            enabled: cfg.enabled,
            max_iterations: cfg.max_iterations,
            max_change: cfg.max_change,
        })
        .unwrap_or(JsValue::NULL)
    }

    pub fn set_iterative_calculation(
        &mut self,
        enabled: bool,
        max_iterations: u32,
        max_change: f64,
    ) -> Result<bool, JsValue> {
        if self.workbook.is_inside_custom_call() {
            return Err(JsValue::from_str(
                "Cannot change iterative calculation inside a custom-formula callback.",
            ));
        }
        Ok(self
            .workbook
            .set_iterative_calculation(einfach_excel_core::IterativeConfig {
                enabled,
                max_iterations,
                max_change,
            }))
    }
}
