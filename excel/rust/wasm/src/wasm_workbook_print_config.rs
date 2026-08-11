// WASM methods for workbook-owned per-sheet print configuration.

#[wasm_bindgen]
impl WasmWorkbook {
    #[wasm_bindgen(js_name = getPrintConfig)]
    pub fn get_print_config(&self, sheet: u32) -> Result<JsValue, JsValue> {
        let snapshot = self
            .workbook
            .print_config(sheet as usize)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        serde_wasm_bindgen::to_value(&PrintConfigSnapshotJSON::from_snapshot(&snapshot))
            .map_err(|error| JsValue::from_str(&format!("serialize print config: {error}")))
    }

    #[wasm_bindgen(js_name = setPrintConfig)]
    pub fn set_print_config(&mut self, sheet: u32, config: JsValue) -> Result<JsValue, JsValue> {
        let config: PrintConfigJSON = serde_wasm_bindgen::from_value(config)
            .map_err(|error| JsValue::from_str(&format!("invalid print config: {error}")))?;
        let snapshot = self
            .workbook
            .set_print_config(
                sheet as usize,
                config
                    .into_config()
                    .map_err(|error| JsValue::from_str(&error))?,
            )
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        serde_wasm_bindgen::to_value(&PrintConfigSnapshotJSON::from_snapshot(&snapshot))
            .map_err(|error| JsValue::from_str(&format!("serialize print config: {error}")))
    }

    fn print_configs_json(&self) -> Vec<PrintConfigSnapshotJSON> {
        self.workbook
            .snapshot_print_configs()
            .iter()
            .map(PrintConfigSnapshotJSON::from_snapshot)
            .collect()
    }

    fn print_config_snapshots_from_json(
        snapshots: Vec<PrintConfigSnapshotJSON>,
        sheet_count: usize,
    ) -> Result<Vec<einfach_excel_core::PrintConfigSnapshot>, String> {
        let mut parsed = Vec::with_capacity(snapshots.len());
        for snapshot in snapshots {
            if snapshot.sheet as usize >= sheet_count {
                return Err(format!(
                    "print config references missing sheet: {}",
                    snapshot.sheet
                ));
            }
            parsed.push(snapshot.into_snapshot()?);
        }
        Ok(parsed)
    }
}
