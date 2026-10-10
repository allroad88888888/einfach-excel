// 分列数据边界：只转换选项和坐标，工作簿计划与历史由 excel-core 执行。
use einfach_excel_core::text_columns::TextColumnsMode;
use einfach_excel_core::workbook_text_columns::{TextColumnsPreview, TextColumnsRequest};

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct TextColumnsRangeJSON {
    row_start: u32,
    col_start: u32,
    row_end: u32,
    col_end: u32,
}

impl From<CellRange> for TextColumnsRangeJSON {
    fn from(range: CellRange) -> Self {
        Self {
            row_start: range.start.row,
            col_start: range.start.col,
            row_end: range.end.row,
            col_end: range.end.col,
        }
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct TextColumnsDestinationJSON {
    row: u32,
    col: u32,
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
enum TextColumnsModeJSON {
    Delimited {
        delimiters: Vec<char>,
        #[serde(rename = "mergeConsecutive")]
        merge_consecutive: bool,
        qualifier: Option<char>,
    },
    FixedWidth {
        breakpoints: Vec<u32>,
    },
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct TextColumnsRequestJSON {
    sheet: usize,
    source: TextColumnsRangeJSON,
    destination: TextColumnsDestinationJSON,
    mode: TextColumnsModeJSON,
    row_count: u32,
    col_count: u32,
}

impl TextColumnsRequestJSON {
    fn native(self) -> TextColumnsRequest {
        TextColumnsRequest {
            sheet: self.sheet,
            source: CellRange::new(
                CellAddress::new(self.source.row_start, self.source.col_start),
                CellAddress::new(self.source.row_end, self.source.col_end),
            ),
            destination: CellAddress::new(self.destination.row, self.destination.col),
            mode: match self.mode {
                TextColumnsModeJSON::Delimited {
                    delimiters,
                    merge_consecutive,
                    qualifier,
                } => TextColumnsMode::Delimited {
                    delimiters,
                    merge_consecutive,
                    qualifier,
                },
                TextColumnsModeJSON::FixedWidth { breakpoints } => TextColumnsMode::FixedWidth {
                    breakpoints: breakpoints.into_iter().map(|n| n as usize).collect(),
                },
            },
            row_count: self.row_count,
            col_count: self.col_count,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TextColumnsPreviewJSON {
    target: TextColumnsRangeJSON,
    overwritten_cells: usize,
    sample: Vec<Vec<String>>,
    sample_truncated: bool,
}

impl From<TextColumnsPreview> for TextColumnsPreviewJSON {
    fn from(preview: TextColumnsPreview) -> Self {
        Self {
            target: preview.target.into(),
            overwritten_cells: preview.overwritten_cells,
            sample: preview.sample,
            sample_truncated: preview.sample_truncated,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TextColumnsReportJSON {
    target: TextColumnsRangeJSON,
    changed_cells: usize,
}

#[wasm_bindgen]
impl WasmWorkbook {
    pub fn preview_text_columns(&self, request: JsValue) -> Result<JsValue, JsValue> {
        let request: TextColumnsRequestJSON = serde_wasm_bindgen::from_value(request)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        let preview = self
            .workbook
            .preview_text_columns(&request.native())
            .map_err(JsValue::from_str)?;
        serde_wasm_bindgen::to_value(&TextColumnsPreviewJSON::from(preview))
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    pub fn split_text_columns(
        &mut self,
        request: JsValue,
        overwrite: bool,
    ) -> Result<JsValue, JsValue> {
        let request: TextColumnsRequestJSON = serde_wasm_bindgen::from_value(request)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        let report = self
            .history
            .split_text_columns(&mut self.workbook, &request.native(), overwrite)
            .map_err(JsValue::from_str)?;
        serde_wasm_bindgen::to_value(&TextColumnsReportJSON {
            target: report.target.into(),
            changed_cells: report.changed_cells,
        })
        .map_err(|error| JsValue::from_str(&error.to_string()))
    }
}
