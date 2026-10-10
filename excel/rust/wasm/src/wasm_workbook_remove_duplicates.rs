// 去重边界只转换参数；比较、压紧及历史均由原生工作簿执行。
use einfach_excel_core::workbook_remove_duplicates::{
    DuplicateComparison, RemoveDuplicatesPreview, RemoveDuplicatesRequest,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RemoveDuplicatesRangeJSON {
    row_start: u32, col_start: u32, row_end: u32, col_end: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
enum DuplicateComparisonJSON { Exact, IgnoreCase, Trim, TrimIgnoreCase }

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RemoveDuplicatesRequestJSON {
    sheet: usize,
    range: RemoveDuplicatesRangeJSON,
    columns: Vec<u32>,
    has_header: bool,
    comparison: DuplicateComparisonJSON,
    row_count: u32,
    col_count: u32,
    #[serde(default)]
    sample_offset: u32,
}

impl RemoveDuplicatesRequestJSON {
    fn native(self) -> RemoveDuplicatesRequest {
        RemoveDuplicatesRequest {
            sheet: self.sheet, range: CellRange::new(
                CellAddress::new(self.range.row_start, self.range.col_start),
                CellAddress::new(self.range.row_end, self.range.col_end)),
            columns: self.columns, has_header: self.has_header,
            comparison: match self.comparison {
                DuplicateComparisonJSON::Exact => DuplicateComparison::Exact,
                DuplicateComparisonJSON::IgnoreCase => DuplicateComparison::IgnoreCase,
                DuplicateComparisonJSON::Trim => DuplicateComparison::Trim,
                DuplicateComparisonJSON::TrimIgnoreCase => DuplicateComparison::TrimIgnoreCase,
            }, row_count: self.row_count, col_count: self.col_count,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DuplicateSampleJSON { row: u32, first_row: u32, values: Vec<String> }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RemoveDuplicatesPreviewJSON {
    scanned_rows: usize,
    removed_rows: usize,
    unique_rows: usize,
    excluded_rows: usize,
    headers: Vec<String>,
    sample_offset: usize,
    sample: Vec<DuplicateSampleJSON>,
    sample_truncated: bool,
}

impl From<RemoveDuplicatesPreview> for RemoveDuplicatesPreviewJSON {
    fn from(value: RemoveDuplicatesPreview) -> Self {
        Self {
            scanned_rows: value.scanned_rows, removed_rows: value.removed_rows,
            unique_rows: value.unique_rows, excluded_rows: value.excluded_rows,
            headers: value.headers, sample_offset: value.sample_offset,
            sample_truncated: value.sample_truncated,
            sample: value.sample.into_iter().map(|row| DuplicateSampleJSON {
                row: row.row, first_row: row.first_row, values: row.values,
            }).collect(),
        }
    }
}

#[wasm_bindgen]
impl WasmWorkbook {
    pub fn preview_remove_duplicates(&self, request: JsValue) -> Result<JsValue, JsValue> {
        let request: RemoveDuplicatesRequestJSON = serde_wasm_bindgen::from_value(request)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        let offset = request.sample_offset as usize;
        let result = self.workbook.preview_remove_duplicates_page(&request.native(), offset)
            .map_err(JsValue::from_str)?;
        serde_wasm_bindgen::to_value(&RemoveDuplicatesPreviewJSON::from(result))
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    pub fn remove_duplicates(&mut self, request: JsValue) -> Result<JsValue, JsValue> {
        let request: RemoveDuplicatesRequestJSON = serde_wasm_bindgen::from_value(request)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        let result = self.history.remove_duplicates(&mut self.workbook, &request.native())
            .map_err(JsValue::from_str)?;
        serde_wasm_bindgen::to_value(&RemoveDuplicatesPreviewJSON::from(result))
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }
}
