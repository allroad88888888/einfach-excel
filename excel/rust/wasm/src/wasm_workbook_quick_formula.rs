// 快捷公式边界只转换坐标及函数选项，不在 JS 推断数据范围。
use einfach_excel_core::workbook_quick_formula::{QuickFormula, QuickFormulaSuggestion};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct QuickFormulaRangeJSON {
    row_start: u32, col_start: u32, row_end: u32, col_end: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
enum QuickFormulaJSON { Sum, Average, Count }

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct QuickFormulaRequestJSON {
    sheet: usize,
    range: QuickFormulaRangeJSON,
    function: QuickFormulaJSON,
    row_count: u32,
    col_count: u32,
}

impl QuickFormulaRequestJSON {
    fn suggest(self, workbook: &Workbook) -> Result<QuickFormulaSuggestion, &'static str> {
        let range = CellRange::new(
            CellAddress::new(self.range.row_start, self.range.col_start),
            CellAddress::new(self.range.row_end, self.range.col_end));
        let function = match self.function {
            QuickFormulaJSON::Sum => QuickFormula::Sum,
            QuickFormulaJSON::Average => QuickFormula::Average,
            QuickFormulaJSON::Count => QuickFormula::Count,
        };
        workbook.suggest_quick_formula(self.sheet, range, self.row_count, self.col_count, function)
    }
}

#[derive(Serialize)]
struct QuickFormulaTargetJSON { row: u32, col: u32 }

#[derive(Serialize)]
struct QuickFormulaSuggestionJSON { target: QuickFormulaTargetJSON, input: String }

impl From<QuickFormulaSuggestion> for QuickFormulaSuggestionJSON {
    fn from(value: QuickFormulaSuggestion) -> Self {
        Self { target: QuickFormulaTargetJSON { row: value.target.row, col: value.target.col },
            input: value.input }
    }
}

#[wasm_bindgen]
impl WasmWorkbook {
    /// 只读建议：不写入内容、不增加历史，用户确认仍走 set_cell_input。
    pub fn suggest_quick_formula(&self, request: JsValue) -> Result<JsValue, JsValue> {
        let request: QuickFormulaRequestJSON = serde_wasm_bindgen::from_value(request)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        let result = request.suggest(&self.workbook).map_err(JsValue::from_str)?;
        serde_wasm_bindgen::to_value(&QuickFormulaSuggestionJSON::from(result))
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }
}
