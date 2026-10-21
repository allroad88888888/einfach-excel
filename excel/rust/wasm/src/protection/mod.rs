// Password-free protection is persisted and enforced in the native workbook.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct SheetProtectionJSON {
    sheet: u32,
    protection: einfach_excel_core::protection::SheetProtection,
}

#[wasm_bindgen]
impl WasmWorkbook {
    pub fn read_protection(&self, sheet: u32) -> Result<JsValue, JsValue> {
        let state = self.workbook.read_protection(sheet as usize).map_err(JsValue::from_str)?;
        state.serialize(&serde_wasm_bindgen::Serializer::json_compatible())
            .map_err(|error| JsValue::from_str(&format!("serialize protection: {error}")))
    }

    pub fn change_protection(&mut self, sheet: u32, change: JsValue) -> Result<bool, JsValue> {
        if self.history.is_pending() {
            return Err(JsValue::from_str("Finish the current edit or history operation first."));
        }
        let change = serde_wasm_bindgen::from_value(change)
            .map_err(|error| JsValue::from_str(&format!("Invalid protection change: {error}")))?;
        self.workbook.change_protection(sheet as usize, change).map_err(JsValue::from_str)
    }
}

#[cfg(test)]
mod protection_tests {
    use super::*;
    include!("tests.rs");
}

impl WasmWorkbook {
    fn ensure_protection_range(&self, sheet: u32, range: CellRange) -> Result<(), JsValue> {
        self.workbook.ensure_range_editable(sheet as usize, range).map_err(JsValue::from_str)
    }

    fn ensure_protection_sheet(&self, sheet: u32) -> Result<(), JsValue> {
        self.workbook.ensure_sheet_unprotected(sheet as usize).map_err(JsValue::from_str)
    }

    fn ensure_protection_workbook(&self) -> Result<(), JsValue> {
        self.workbook.ensure_workbook_unprotected().map_err(JsValue::from_str)
    }

    fn protection_json(&self) -> Vec<SheetProtectionJSON> {
        (0..self.workbook.sheet_count()).filter_map(|sheet| {
            let protection = self.workbook.read_protection(sheet).ok()?;
            (protection != Default::default())
                .then_some(SheetProtectionJSON { sheet: sheet as u32, protection })
        }).collect()
    }

    fn restore_protection_json(workbook: &mut Workbook, entries: Vec<SheetProtectionJSON>)
        -> Result<(), String>
    {
        workbook.restore_protection(entries.into_iter()
            .map(|entry| (entry.sheet as usize, entry.protection)).collect()).map_err(str::to_string)
    }
}
