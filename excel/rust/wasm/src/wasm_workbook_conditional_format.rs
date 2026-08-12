// WASM methods for workbook-owned per-sheet conditional-format configuration.

#[wasm_bindgen]
impl WasmWorkbook {
    #[wasm_bindgen(js_name = listConditionalFormats)]
    pub fn list_conditional_formats(&self, sheet: u32) -> Result<JsValue, JsValue> {
        let snapshot = self
            .workbook
            .conditional_format_config(sheet as usize)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        let wire = ConditionalFormatConfigSnapshotJSON::from_snapshot(&snapshot)
            .map_err(|error| JsValue::from_str(&error))?;
        serde_wasm_bindgen::to_value(&wire)
            .map_err(|error| JsValue::from_str(&format!("serialize conditional formats: {error}")))
    }

    #[wasm_bindgen(js_name = setConditionalFormatRule)]
    pub fn set_conditional_format_rule(
        &mut self,
        sheet: u32,
        request: JsValue,
    ) -> Result<JsValue, JsValue> {
        let request: SetConditionalFormatRuleJSON = serde_wasm_bindgen::from_value(request)
            .map_err(|error| {
                JsValue::from_str(&format!("invalid conditional-format rule: {error}"))
            })?;
        let current = self
            .workbook
            .conditional_format_config(sheet as usize)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        let rule_id = request
            .rule_id
            .clone()
            .unwrap_or_else(|| next_conditional_format_rule_id(&current));
        let revision = request.revision;
        let rule = request
            .into_entry(rule_id)
            .map_err(|error| JsValue::from_str(&error))?;
        let snapshot = self
            .workbook
            .set_conditional_format_rule(sheet as usize, revision, rule)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        let wire = ConditionalFormatConfigSnapshotJSON::from_snapshot(&snapshot)
            .map_err(|error| JsValue::from_str(&error))?;
        serde_wasm_bindgen::to_value(&wire)
            .map_err(|error| JsValue::from_str(&format!("serialize conditional formats: {error}")))
    }

    #[wasm_bindgen(js_name = removeConditionalFormatRule)]
    pub fn remove_conditional_format_rule(
        &mut self,
        sheet: u32,
        request: JsValue,
    ) -> Result<JsValue, JsValue> {
        let request: RemoveConditionalFormatRuleJSON = serde_wasm_bindgen::from_value(request)
            .map_err(|error| {
                JsValue::from_str(&format!("invalid conditional-format removal: {error}"))
            })?;
        let snapshot = self
            .workbook
            .remove_conditional_format_rule(sheet as usize, request.revision, &request.rule_id)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        let wire = ConditionalFormatConfigSnapshotJSON::from_snapshot(&snapshot)
            .map_err(|error| JsValue::from_str(&error))?;
        serde_wasm_bindgen::to_value(&wire)
            .map_err(|error| JsValue::from_str(&format!("serialize conditional formats: {error}")))
    }

    fn conditional_formats_json(&self) -> Result<Vec<ConditionalFormatConfigSnapshotJSON>, String> {
        self.workbook
            .snapshot_conditional_formats()
            .iter()
            .map(ConditionalFormatConfigSnapshotJSON::from_snapshot)
            .collect()
    }

    fn conditional_format_snapshots_from_json(
        snapshots: Vec<ConditionalFormatConfigSnapshotJSON>,
        sheet_count: usize,
    ) -> Result<Vec<ConditionalFormatConfigSnapshot>, String> {
        let mut parsed = Vec::with_capacity(snapshots.len());
        for snapshot in snapshots {
            if snapshot.sheet as usize >= sheet_count {
                return Err(format!(
                    "conditional formats reference missing sheet: {}",
                    snapshot.sheet
                ));
            }
            parsed.push(snapshot.into_snapshot()?);
        }
        Ok(parsed)
    }
}

fn next_conditional_format_rule_id(snapshot: &ConditionalFormatConfigSnapshot) -> String {
    let mut suffix = snapshot.rules.len() + 1;
    loop {
        let id = format!("conditional-format-{suffix}");
        if !snapshot.rules.iter().any(|rule| rule.id == id) {
            return id;
        }
        suffix += 1;
    }
}
