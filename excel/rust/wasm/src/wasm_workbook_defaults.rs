// Defaults belong to the native worksheet, including empty cells and future insertions.
#[wasm_bindgen]
impl WasmWorkbook {
    pub fn sheet_defaults(&self, idx: u32) -> Result<JsValue, JsValue> {
        let sheet = self.workbook.sheet(idx as usize)
            .ok_or_else(|| JsValue::from_str("The worksheet no longer exists."))?;
        serde_wasm_bindgen::to_value(&sheet.defaults())
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }
    pub fn initialize_sheet_defaults(&mut self, idx: u32, json: &str) -> Result<(), JsValue> {
        self.ensure_protection_sheet(idx)?;
        let defaults: einfach_excel_core::sheet::SheetDefaults = serde_json::from_str(json)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        self.workbook.sheet_mut(idx as usize)
            .ok_or_else(|| JsValue::from_str("The worksheet no longer exists."))?
            .set_defaults(defaults).map_err(JsValue::from_str)
    }
}
