#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AutoFitTextJSON {
    text: String,
    numeric_value: Option<f64>,
    format: CellFormatJSON,
    width: f64,
}

#[wasm_bindgen]
impl WasmWorkbook {
    /// 浏览器只提供一次文字测量回调；Rust 遍历稀疏数据并在测量全部成功后写尺寸。
    pub fn auto_fit_dimensions(
        &mut self,
        sheet: u32,
        start_row: u32,
        start_col: u32,
        end_row: u32,
        end_col: u32,
        axis: &str,
        default_row: u32,
        default_col: u32,
        measure: &js_sys::Function,
    ) -> Result<bool, JsValue> {
        self.workbook.auto_fit_dimensions(
            sheet as usize,
            CellRange::new(CellAddress::new(start_row, start_col), CellAddress::new(end_row, end_col)),
            axis, default_row, default_col,
            |value, format, width| {
                let value = collapse_array_for_js(value);
                let value = value.as_ref();
                let input = AutoFitTextJSON {
                    text: match value {
                        Value::Number(n) if matches!(format.number_format, NumberFormat::Date(_)) =>
                            format.format_number(*n),
                        _ => value_to_display(value),
                    },
                    numeric_value: match value { Value::Number(n) => Some(*n), _ => None },
                    format: CellFormatJSON::from_format(format), width,
                };
                let input = serde_wasm_bindgen::to_value(&input).map_err(|e| e.to_string())?;
                measure.call1(&JsValue::NULL, &input)
                    .map_err(|_| "Text measurement failed.".to_string())?
                    .as_f64().ok_or_else(|| "Text measurement must return pixels.".to_string())
            },
        ).map_err(|error| JsValue::from_str(&error))
    }
}
