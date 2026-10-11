// 分组配置直通原生历史；绑定不维护第二份分组状态。
#[wasm_bindgen]
impl WasmWorkbook {
    pub fn change_outline(&mut self, sheet: u32, axis: &str, action: JsValue) -> Result<bool, JsValue> {
        let axis = match axis {
            "row" => einfach_excel_core::outline::OutlineAxis::Row,
            "column" => einfach_excel_core::outline::OutlineAxis::Column,
            _ => return Err(JsValue::from_str("Invalid outline axis.")),
        };
        let action = serde_wasm_bindgen::from_value(action)
            .map_err(|error| JsValue::from_str(&format!("Invalid outline action: {error}")))?;
        self.history.change_outline(&mut self.workbook, sheet as usize, axis, action)
            .map_err(JsValue::from_str)
    }
}
