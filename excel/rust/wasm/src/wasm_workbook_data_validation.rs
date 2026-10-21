// 数据验证的 WASM 边界：UI 读取当前格规则，修改仍进入同一条原生历史。
#[wasm_bindgen]
impl WasmWorkbook {
    #[wasm_bindgen(js_name = getDataValidation)]
    pub fn get_data_validation(&self, sheet: u32, row: u32, col: u32) -> Result<JsValue, JsValue> {
        if row >= 1_048_576 || col >= 16_384 {
            return Err(JsValue::from_str("INVALID_ADDRESS"));
        }
        let sheet = self
            .workbook
            .sheet(sheet as usize)
            .ok_or_else(|| JsValue::from_str("INVALID_SHEET"))?;
        let rule = sheet
            .data_validation_at(CellAddress::new(row, col))
            .map(DataValidationRuleJSON::from_rule);
        rule.serialize(&serde_wasm_bindgen::Serializer::json_compatible())
            .map_err(|error| JsValue::from_str(&format!("serialize data validation: {error}")))
    }

    #[wasm_bindgen(js_name = setDataValidation)]
    pub fn set_data_validation(
        &mut self,
        sheet: u32,
        start_row: u32,
        start_col: u32,
        end_row: u32,
        end_col: u32,
        rule: JsValue,
    ) -> Result<(), JsValue> {
        // null 表示清除；不混用一个携带伪规则的 enabled=false 状态。
        let rule: Option<DataValidationRuleJSON> =
            serde_wasm_bindgen::from_value(rule).map_err(|error| {
                JsValue::from_str(&format!("invalid data-validation rule: {error}"))
            })?;
        let mut rule = rule
            .map(DataValidationRuleJSON::into_rule)
            .transpose()
            .map_err(JsValue::from_str)?;
        // 保存表单时公式按新选区左上角解释；文件恢复沿 wire 中已保存的 anchor。
        if let Some(DataValidationRule { kind: DataValidationKind::CustomFormula { anchor, .. }, .. }) = &mut rule {
            *anchor = CellAddress::new(start_row, start_col);
        }
        self.history
            .set_data_validation(
                &mut self.workbook,
                sheet as usize,
                CellRange::new(
                    CellAddress::new(start_row, start_col),
                    CellAddress::new(end_row, end_col),
                ),
                rule,
            )
            .map_err(JsValue::from_str)
    }
}
