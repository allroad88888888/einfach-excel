// Source expressions cross JSON; the existing callback API stays host-only.
#[wasm_bindgen]
impl WasmWorkbook {
    pub fn read_custom_formulas(&self) -> Result<String, JsValue> {
        serde_json::to_string(&self.workbook.custom_formula_definitions())
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    pub fn change_custom_formula(
        &mut self,
        sheet: u32,
        action_json: &str,
    ) -> Result<bool, JsValue> {
        let action: einfach_excel_core::custom_formulas::CustomFormulaAction =
            serde_json::from_str(action_json)
                .map_err(|error| JsValue::from_str(&error.to_string()))?;
        self.history
            .change_custom_formula(&mut self.workbook, sheet as usize, action)
            .map_err(JsValue::from_str)
    }
}

#[cfg(test)]
mod custom_formula_tests {
    include!("tests.rs");
}
