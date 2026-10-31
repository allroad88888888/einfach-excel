// 选择助手的序列化边界：仅可见单元格与当前区域都由 Rust 引擎基于真实工作簿数据计算。

fn select_special_range(range: &LocateRangeJSON) -> CellRange {
    CellRange::new(
        CellAddress::new(range.row_start, range.col_start),
        CellAddress::new(range.row_end, range.col_end),
    )
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct VisibleCellsRequestJSON {
    sheet: usize,
    ranges: Vec<LocateRangeJSON>,
    limit: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VisibleCellsJSON {
    blocks: Vec<LocateRangeJSON>,
    cell_count: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CurrentRegionRequestJSON {
    sheet: usize,
    row: u32,
    col: u32,
}

impl VisibleCellsRequestJSON {
    fn query(self, workbook: &Workbook) -> Result<VisibleCellsJSON, &'static str> {
        let ranges: Vec<CellRange> = self.ranges.iter().map(select_special_range).collect();
        let found = workbook.visible_blocks(self.sheet, &ranges, self.limit)?;
        Ok(VisibleCellsJSON {
            blocks: found.blocks.into_iter().map(Into::into).collect(),
            cell_count: found.cell_count,
        })
    }
}

#[wasm_bindgen]
impl WasmWorkbook {
    pub fn select_visible_cells(&self, request: JsValue) -> Result<JsValue, JsValue> {
        let request: VisibleCellsRequestJSON = serde_wasm_bindgen::from_value(request)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        let result = request.query(&self.workbook).map_err(JsValue::from_str)?;
        result.serialize(&serde_wasm_bindgen::Serializer::json_compatible())
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    pub fn select_current_region(&self, request: JsValue) -> Result<JsValue, JsValue> {
        let request: CurrentRegionRequestJSON = serde_wasm_bindgen::from_value(request)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        let range = self.workbook
            .current_region(request.sheet, CellAddress::new(request.row, request.col))
            .map_err(JsValue::from_str)?;
        LocateRangeJSON::from(range).serialize(&serde_wasm_bindgen::Serializer::json_compatible())
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }
}

#[cfg(test)]
mod select_special_wire_tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn visible_request_rejects_unknown_fields_and_encodes_blocks() {
        let request = json!({ "sheet": 0, "limit": 10,
            "ranges": [{ "rowStart": 0, "colStart": 0, "rowEnd": 1, "colEnd": 1 }] });
        let query: VisibleCellsRequestJSON = serde_json::from_value(request.clone()).unwrap();
        let mut workbook = Workbook::new();
        workbook.hide_rows(0, &[0]);
        let result = serde_json::to_value(query.query(&workbook).unwrap()).unwrap();
        assert_eq!(result["cellCount"], json!(2));
        assert_eq!(result["blocks"], json!([{ "rowStart": 1, "colStart": 0, "rowEnd": 1, "colEnd": 1 }]));
        let mut extra = request;
        extra["extra"] = json!(true);
        assert!(serde_json::from_value::<VisibleCellsRequestJSON>(extra).is_err());
        assert!(serde_json::from_value::<CurrentRegionRequestJSON>(json!({ "sheet": 0, "row": -1, "col": 0 })).is_err());
    }
}
