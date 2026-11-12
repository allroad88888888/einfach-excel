// 数字格式草稿的只读预览，复用 Rust 显示规则，不写样式或历史。
// 自定义代码先在这里校验，无效时返回类型化错误码，对话框据此给出可纠正的提示。
#[derive(Clone, Debug, Default, PartialEq, Serialize)]
struct NumberFormatPreviewJSON {
    #[serde(skip_serializing_if = "Option::is_none")]
    text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    color: Option<String>,
    /// 与网格同一份 `*x` 填充和 `_x` 留白，预览用同一个组件排版。
    #[serde(skip_serializing_if = "Option::is_none")]
    fill: Option<FormattedCharJSON>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pads: Vec<FormattedCharJSON>,
    #[serde(rename = "invalidCode", skip_serializing_if = "Option::is_none")]
    invalid_code: Option<&'static str>,
}

#[wasm_bindgen]
impl WasmWorkbook {
    pub fn preview_number_format(
        &self, sheet_idx: u32, addr: &str, format: JsValue,
    ) -> Result<JsValue, JsValue> {
        let format: NumberFormatJSON = serde_wasm_bindgen::from_value(format)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        let preview = self.number_format_preview(sheet_idx, addr, format).map_err(JsValue::from_str)?;
        preview.serialize(&serde_wasm_bindgen::Serializer::json_compatible())
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }
}

impl WasmWorkbook {
    fn number_format_preview(
        &self, sheet_idx: u32, addr: &str, wire: NumberFormatJSON,
    ) -> Result<NumberFormatPreviewJSON, &'static str> {
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
        if wire.kind == "custom" {
            let code = wire.pattern.as_deref().unwrap_or_default();
            if let Err(error) = einfach_excel_core::custom_number_format::validate(code) {
                return Ok(NumberFormatPreviewJSON { invalid_code: Some(error.code()), ..Default::default() });
            }
        }
        let addr = coord.to_string_repr();
        let mut format = sheet.get_format(&addr);
        format.number_format = wire.into_number_format();
        let value = self.workbook_value(sheet_idx, &addr);
        let value = collapse_array_for_js(&value);
        if let NumberFormat::Custom(pattern) = &format.number_format {
            let shown = match value.as_ref() {
                Value::Number(number) => einfach_excel_core::custom_number_format::format_number(pattern, *number),
                Value::Text(text) => einfach_excel_core::custom_number_format::format_text(pattern, text),
                _ => None,
            };
            if let Some(shown) = shown {
                let shown = NativeNumberDisplay::from(shown);
                return Ok(NumberFormatPreviewJSON {
                    text: Some(shown.text), color: shown.color, fill: shown.fill, pads: shown.pads,
                    invalid_code: None,
                });
            }
        }
        let text = match value.as_ref() {
            Value::Number(number) => format.format_number(*number),
            value => value_to_display(value),
        };
        Ok(NumberFormatPreviewJSON { text: Some(text), ..Default::default() })
    }
}
