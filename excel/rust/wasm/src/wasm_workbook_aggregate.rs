// 只转换选区坐标与统计结果；所有计算都在 excel-core。
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AggregateTargetJSON {
    sheet: usize,
    row_start: u32,
    col_start: u32,
    row_end: u32,
    col_end: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SelectionNumbersJSON {
    count: u64,
    numeric_count: u64,
    sum: Option<f64>,
    average: Option<f64>,
    min: Option<f64>,
    max: Option<f64>,
}

#[wasm_bindgen]
impl WasmWorkbook {
    pub fn aggregate_selection(&self, targets: JsValue) -> Result<JsValue, JsValue> {
        let targets: Vec<AggregateTargetJSON> = serde_wasm_bindgen::from_value(targets)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        let ranges: Vec<_> = targets
            .into_iter()
            .map(|target| {
                (
                    target.sheet,
                    CellRange::new(
                        CellAddress::new(target.row_start, target.col_start),
                        CellAddress::new(target.row_end, target.col_end),
                    ),
                )
            })
            .collect();
        let result = self
            .workbook
            .aggregate_selection(&ranges)
            .map_err(JsValue::from_str)?;
        SelectionNumbersJSON {
            count: result.count,
            numeric_count: result.numeric_count,
            sum: result.sum,
            average: result.average,
            min: result.min,
            max: result.max,
        }
        .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
        .map_err(|e| JsValue::from_str(&e.to_string()))
    }
}
