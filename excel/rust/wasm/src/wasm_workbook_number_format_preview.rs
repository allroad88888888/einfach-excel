// 数字格式草稿的只读预览，复用 Rust 显示规则，不写样式或历史。
#[wasm_bindgen]
impl WasmWorkbook {
    pub fn preview_number_format(
        &self, sheet_idx: u32, addr: &str, format: JsValue,
    ) -> Result<String, JsValue> {
        let format: NumberFormatJSON = serde_wasm_bindgen::from_value(format)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        self.number_format_preview(sheet_idx, addr, format).map_err(JsValue::from_str)
    }
}

impl WasmWorkbook {
    fn number_format_preview(
        &self, sheet_idx: u32, addr: &str, wire: NumberFormatJSON,
    ) -> Result<String, &'static str> {
        let sheet = self.workbook.sheet(sheet_idx as usize).ok_or("INVALID_SHEET")?;
        let coord = CellAddress::parse(addr).ok_or("INVALID_ADDRESS")?;
        // 持久化 full_sheet_range 使用 u32 全域；用户地址必须限制在 Excel 行列边界。
        if coord.row >= 1_048_576 || coord.col >= 16_384 {
            return Err("INVALID_ADDRESS");
        }
        if !matches!(wire.kind.as_str(), "general" | "text" | "number" | "decimal"
            | "percent" | "percentage" | "currency" | "scientific" | "fraction"
            | "time" | "date" | "custom") {
            return Err("INVALID_NUMBER_FORMAT");
        }
        let addr = coord.to_string_repr();
        let mut format = sheet.get_format(&addr);
        format.number_format = wire.into_number_format();
        let value = self.workbook_value(sheet_idx, &addr);
        let value = collapse_array_for_js(&value);
        Ok(match value.as_ref() {
            Value::Number(number) => format.format_number(*number),
            value => value_to_display(value),
        })
    }
}
