// 显式 Continue 仍通过原生普通输入/Table/保护/历史同一入口。
#[wasm_bindgen]
impl WasmWorkbook {
    #[wasm_bindgen(js_name = getLastValidationFailure)]
    pub fn get_last_validation_failure(&self) -> Result<JsValue, JsValue> {
        self.workbook.take_validation_failure()
            .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }
    #[wasm_bindgen(js_name = setCellInputConfirmed)]
    pub fn set_cell_input_confirmed(&mut self, sheet: usize, addr: &str, input: &str,
        expand_tables: bool) -> Result<(), JsValue> {
        let history = &mut self.history;
        self.workbook.with_validation_confirmation(true, |workbook| {
            history.set_cell_input_with_table_expansion(workbook, sheet, addr, input, expand_tables)
        }).map_err(|error| JsValue::from_str(&error))
    }
}

#[cfg(test)]
mod advanced_validation_tests {
    use super::*;
    include!("tests.rs");
}
