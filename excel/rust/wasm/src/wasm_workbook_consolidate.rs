// Native adapter for worksheet Consolidate preview and history-backed mutation.
use einfach_excel_core::consolidate::{
    ConsolidateFunction, ConsolidateOverwriteApproval, ConsolidatePreview, ConsolidateReport,
    ConsolidateRequest, ConsolidateSource,
};

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ConsolidateSourceJSON {
    sheet: usize,
    range: FilterRangeJSON,
}

impl From<ConsolidateSourceJSON> for ConsolidateSource {
    fn from(value: ConsolidateSourceJSON) -> Self {
        Self {
            sheet: value.sheet,
            range: value.range.into_range(),
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ConsolidateRequestJSON {
    function: ConsolidateFunction,
    sources: Vec<ConsolidateSourceJSON>,
    sheet: usize,
    destination: CellCoordinateJSON,
    #[serde(default)]
    top_row: bool,
    #[serde(default)]
    left_column: bool,
    #[serde(default)]
    create_links: bool,
    row_count: u32,
    col_count: u32,
}

impl From<ConsolidateRequestJSON> for ConsolidateRequest {
    fn from(value: ConsolidateRequestJSON) -> Self {
        Self {
            function: value.function,
            sources: value.sources.into_iter().map(Into::into).collect(),
            sheet: value.sheet,
            destination: CellAddress::new(value.destination.row, value.destination.col),
            top_row: value.top_row,
            left_column: value.left_column,
            create_links: value.create_links,
            row_count: value.row_count,
            col_count: value.col_count,
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ConsolidateOverwriteApprovalJSON {
    target: FilterRangeJSON,
    count: usize,
}

impl From<ConsolidateOverwriteApprovalJSON> for ConsolidateOverwriteApproval {
    fn from(value: ConsolidateOverwriteApprovalJSON) -> Self {
        Self {
            target: value.target.into_range(),
            count: value.count,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ConsolidatePreviewJSON {
    target: FilterRangeJSON,
    row_count: u32,
    col_count: u32,
    overwritten_cells: usize,
    sample: Vec<Vec<String>>,
    sample_truncated: bool,
}

impl From<ConsolidatePreview> for ConsolidatePreviewJSON {
    fn from(preview: ConsolidatePreview) -> Self {
        let sample_cols = preview.sample.first().map_or(0, Vec::len) as u32;
        let sample_truncated =
            preview.row_count > preview.sample.len() as u32 || preview.col_count > sample_cols;
        Self {
            target: FilterRangeJSON::from_range(preview.target),
            row_count: preview.row_count,
            col_count: preview.col_count,
            overwritten_cells: preview.overwritten_cells,
            sample: preview.sample,
            sample_truncated,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ConsolidateReportJSON {
    target: FilterRangeJSON,
    changed_cells: usize,
    linked_groups: usize,
}

impl From<ConsolidateReport> for ConsolidateReportJSON {
    fn from(report: ConsolidateReport) -> Self {
        Self {
            target: FilterRangeJSON::from_range(report.target),
            changed_cells: report.changed_cells,
            linked_groups: report.linked_groups,
        }
    }
}

#[wasm_bindgen]
impl WasmWorkbook {
    pub fn preview_consolidate(&self, request: JsValue) -> Result<JsValue, JsValue> {
        let request: ConsolidateRequestJSON = serde_wasm_bindgen::from_value(request)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        let preview = self
            .workbook
            .preview_consolidate(&request.into())
            .map_err(JsValue::from_str)?;
        serde_wasm_bindgen::to_value(&ConsolidatePreviewJSON::from(preview))
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    pub fn apply_consolidate(
        &mut self,
        request: JsValue,
        approval: JsValue,
    ) -> Result<JsValue, JsValue> {
        let request: ConsolidateRequestJSON = serde_wasm_bindgen::from_value(request)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        let approval: Option<ConsolidateOverwriteApprovalJSON> =
            serde_wasm_bindgen::from_value(approval)
                .map_err(|error| JsValue::from_str(&error.to_string()))?;
        let report = self
            .history
            .consolidate(&mut self.workbook, &request.into(), approval.map(Into::into))
            .map_err(JsValue::from_str)?;
        serde_wasm_bindgen::to_value(&ConsolidateReportJSON::from(report))
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }
}
