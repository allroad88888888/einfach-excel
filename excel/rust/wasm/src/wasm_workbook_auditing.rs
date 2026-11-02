// Formula Auditing WASM wire boundary: Trace Precedents, Trace Dependents,
// Evaluate Formula Steps, and Watch Window cell snapshots.
use einfach_excel_core::{
    AuditingRef, FormulaEvalStep, FormulaEvaluationTrace, WatchedCellSnapshot,
};

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AuditingRangeJSON {
    row_start: u32,
    col_start: u32,
    row_end: u32,
    col_end: u32,
}

impl From<CellRange> for AuditingRangeJSON {
    fn from(r: CellRange) -> Self {
        let norm = r.normalize();
        Self {
            row_start: norm.start.row,
            col_start: norm.start.col,
            row_end: norm.end.row,
            col_end: norm.end.col,
        }
    }
}

fn format_range_a1(r: CellRange) -> String {
    let norm = r.normalize();
    if norm.start == norm.end {
        norm.start.to_string()
    } else {
        format!("{}:{}", norm.start, norm.end)
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AuditingRefJSON {
    sheet_index: usize,
    sheet_name: String,
    row_start: u32,
    col_start: u32,
    row_end: u32,
    col_end: u32,
    is_range: bool,
    range: AuditingRangeJSON,
    addr: String,
    is_error: bool,
}

impl From<AuditingRef> for AuditingRefJSON {
    fn from(item: AuditingRef) -> Self {
        let addr = format_range_a1(item.range);
        let range: AuditingRangeJSON = item.range.into();
        let is_range = range.row_start != range.row_end || range.col_start != range.col_end;
        Self {
            sheet_index: item.sheet_index,
            sheet_name: item.sheet_name,
            row_start: range.row_start,
            col_start: range.col_start,
            row_end: range.row_end,
            col_end: range.col_end,
            is_range,
            range,
            addr,
            is_error: item.is_error,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AuditingStepInTargetJSON {
    sheet_index: usize,
    sheet_name: String,
    row: u32,
    col: u32,
    addr: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FormulaEvalStepJSON {
    expression_before: String,
    focus_start: usize,
    focus_end: usize,
    focus_span: (usize, usize),
    focus_text: String,
    step_result: String,
    expression_after: String,
    step_in_target: Option<AuditingStepInTargetJSON>,
}

fn byte_span_to_utf16(text: &str, byte_span: (usize, usize)) -> (usize, usize) {
    let start = byte_span.0.min(text.len());
    let end = byte_span.1.min(text.len()).max(start);
    let u_start = text[..start].encode_utf16().count();
    let u_end = u_start + text[start..end].encode_utf16().count();
    (u_start, u_end)
}

impl From<FormulaEvalStep> for FormulaEvalStepJSON {
    fn from(step: FormulaEvalStep) -> Self {
        let s = step.focus_span.0.min(step.expression_before.len());
        let e = step.focus_span.1.min(step.expression_before.len()).max(s);
        let focus_text = step.expression_before[s..e].to_string();
        let focus_span = byte_span_to_utf16(&step.expression_before, (s, e));
        let step_in_target =
            step.step_in_target
                .map(|(sheet_index, sheet_name, addr)| AuditingStepInTargetJSON {
                    sheet_index,
                    sheet_name,
                    row: addr.row,
                    col: addr.col,
                    addr: addr.to_string(),
                });
        Self {
            expression_before: step.expression_before,
            focus_start: focus_span.0,
            focus_end: focus_span.1,
            focus_span,
            focus_text,
            step_result: step.step_result,
            expression_after: step.expression_after,
            step_in_target,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FormulaEvaluationTraceJSON {
    sheet_index: usize,
    sheet_name: String,
    row: u32,
    col: u32,
    addr: String,
    formula: String,
    is_formula: bool,
    steps: Vec<FormulaEvalStepJSON>,
    final_result: String,
    is_error: bool,
}

impl From<FormulaEvaluationTrace> for FormulaEvaluationTraceJSON {
    fn from(trace: FormulaEvaluationTrace) -> Self {
        Self {
            sheet_index: trace.sheet_index,
            sheet_name: trace.sheet_name,
            row: trace.addr.row,
            col: trace.addr.col,
            addr: trace.addr.to_string(),
            formula: trace.formula,
            is_formula: trace.is_formula,
            steps: trace.steps.into_iter().map(Into::into).collect(),
            final_result: trace.final_result,
            is_error: trace.is_error,
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WatchTargetRequestJSON {
    sheet: Option<usize>,
    sheet_index: Option<usize>,
    row: u32,
    col: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WatchedCellSnapshotJSON {
    sheet_index: usize,
    sheet_name: String,
    row: u32,
    col: u32,
    addr: String,
    name: Option<String>,
    value: String,
    formula: String,
    is_error: bool,
}

impl From<WatchedCellSnapshot> for WatchedCellSnapshotJSON {
    fn from(item: WatchedCellSnapshot) -> Self {
        Self {
            sheet_index: item.sheet_index,
            sheet_name: item.sheet_name,
            row: item.addr.row,
            col: item.addr.col,
            addr: item.addr.to_string(),
            name: item.name,
            value: item.value,
            formula: item.formula,
            is_error: item.is_error,
        }
    }
}

#[wasm_bindgen]
impl WasmWorkbook {
    pub fn trace_precedents(&self, sheet: usize, row: u32, col: u32) -> Result<JsValue, JsValue> {
        let refs: Vec<AuditingRefJSON> = self
            .workbook
            .trace_precedents(sheet, CellAddress::new(row, col))
            .into_iter()
            .map(Into::into)
            .collect();
        refs.serialize(&serde_wasm_bindgen::Serializer::json_compatible())
            .map_err(|err| JsValue::from_str(&err.to_string()))
    }

    pub fn trace_dependents(&self, sheet: usize, row: u32, col: u32) -> Result<JsValue, JsValue> {
        let refs: Vec<AuditingRefJSON> = self
            .workbook
            .trace_dependents(sheet, CellAddress::new(row, col))
            .into_iter()
            .map(Into::into)
            .collect();
        refs.serialize(&serde_wasm_bindgen::Serializer::json_compatible())
            .map_err(|err| JsValue::from_str(&err.to_string()))
    }

    pub fn evaluate_formula_steps(
        &self,
        sheet: usize,
        row: u32,
        col: u32,
    ) -> Result<JsValue, JsValue> {
        let trace = FormulaEvaluationTraceJSON::from(
            self.workbook
                .evaluate_formula_steps(sheet, CellAddress::new(row, col)),
        );
        trace
            .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
            .map_err(|err| JsValue::from_str(&err.to_string()))
    }

    pub fn inspect_watched_cells(&self, targets: JsValue) -> Result<JsValue, JsValue> {
        let parsed: Vec<WatchTargetRequestJSON> = serde_wasm_bindgen::from_value(targets)
            .map_err(|err| JsValue::from_str(&err.to_string()))?;
        let coords: Vec<(usize, CellAddress)> = parsed
            .into_iter()
            .map(|t| (t.sheet.or(t.sheet_index).unwrap_or(0), CellAddress::new(t.row, t.col)))
            .collect();
        let results: Vec<WatchedCellSnapshotJSON> = self
            .workbook
            .inspect_watched_cells(&coords)
            .into_iter()
            .map(Into::into)
            .collect();
        results
            .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
            .map_err(|err| JsValue::from_str(&err.to_string()))
    }
}
