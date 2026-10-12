// 定位条件的序列化边界；分类、合并格边界和稀疏矩形打包只由 Rust 引擎计算。
use einfach_excel_core::{LocateKind, LocatedCells};

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LocateRangeJSON {
    row_start: u32, col_start: u32, row_end: u32, col_end: u32,
}

impl From<CellRange> for LocateRangeJSON {
    fn from(range: CellRange) -> Self {
        Self { row_start: range.start.row, col_start: range.start.col,
            row_end: range.end.row, col_end: range.end.col }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
enum LocateKindJSON { Constants, Formulas, Blanks }

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct LocateRequestJSON {
    sheet: usize,
    range: LocateRangeJSON,
    kind: LocateKindJSON,
    limit: usize,
}

impl LocateRequestJSON {
    fn query(self, workbook: &Workbook) -> Result<LocatedCells, &'static str> {
        let range = CellRange::new(CellAddress::new(self.range.row_start, self.range.col_start),
            CellAddress::new(self.range.row_end, self.range.col_end));
        let kind = match self.kind {
            LocateKindJSON::Constants => LocateKind::Constants,
            LocateKindJSON::Formulas => LocateKind::Formulas,
            LocateKindJSON::Blanks => LocateKind::Blanks,
        };
        workbook.locate_cells(self.sheet, range, kind, self.limit)
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LocatedCellsJSON {
    scope: LocateRangeJSON,
    ranges: Vec<LocateRangeJSON>,
    cell_count: u64,
}

impl From<LocatedCells> for LocatedCellsJSON {
    fn from(result: LocatedCells) -> Self {
        Self { scope: result.scope.into(), ranges: result.ranges.into_iter().map(Into::into).collect(),
            cell_count: result.cell_count }
    }
}

#[wasm_bindgen]
impl WasmWorkbook {
    pub fn locate_cells(&self, request: JsValue) -> Result<JsValue, JsValue> {
        let request: LocateRequestJSON = serde_wasm_bindgen::from_value(request)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        let result = request.query(&self.workbook).map_err(JsValue::from_str)?;
        LocatedCellsJSON::from(result).serialize(&serde_wasm_bindgen::Serializer::json_compatible())
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }
}

#[cfg(test)]
mod locate_wire_tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn decode_classify_and_encode_full_sheet_without_u32_count_overflow() {
        let request = json!({ "sheet": 0, "range": { "rowStart": 0, "colStart": 0,
            "rowEnd": 1048575, "colEnd": 16383 }, "kind": "blanks", "limit": 500 });
        let query: LocateRequestJSON = serde_json::from_value(request.clone()).unwrap();
        let result = serde_json::to_value(LocatedCellsJSON::from(query.query(&Workbook::new()).unwrap())).unwrap();
        assert_eq!(result["cellCount"], json!(17_179_869_184_u64));
        assert_eq!(result["scope"], request["range"]);
        assert_eq!(result["ranges"], json!([request["range"]]));
    }

    #[test]
    fn invalid_wire_requests_fail_instead_of_coercing_coordinates_or_kinds() {
        let valid = json!({ "sheet": 0, "range": { "rowStart": 0, "colStart": 0,
            "rowEnd": 1, "colEnd": 1 }, "kind": "constants", "limit": 500 });
        for (field, value) in [("sheet", json!(-1)), ("limit", json!(1.5)),
            ("kind", json!("unknown")), ("extra", json!(true))] {
            let mut input = valid.clone();
            input[field] = value;
            assert!(serde_json::from_value::<LocateRequestJSON>(input).is_err());
        }
        let mut input = valid;
        input["range"]["rowStart"] = json!(-1);
        assert!(serde_json::from_value::<LocateRequestJSON>(input).is_err());
    }
}
