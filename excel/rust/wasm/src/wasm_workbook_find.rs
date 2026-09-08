// 查找替换的 WASM 数据边界；匹配、写入计划、历史都由 excel-core 执行。
use einfach_excel_core::{FindLookIn, FindMatch, FindQuery};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FindTargetJSON {
    sheet: usize,
    row_start: u32,
    col_start: u32,
    row_end: u32,
    col_end: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FindQueryJSON {
    needle: String,
    case_sensitive: bool,
    whole_cell: bool,
    #[serde(default)]
    wildcards: bool,
    look_in: FindLookInJSON,
}

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
enum FindLookInJSON {
    Values,
    Formulas,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct FindMatchJSON {
    sheet: usize,
    row: u32,
    col: u32,
    start: usize,
    end: usize,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct FindRequestJSON {
    targets: Vec<FindTargetJSON>,
    query: FindQueryJSON,
    offset: usize,
    limit: usize,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ReplaceRequestJSON {
    targets: Vec<FindTargetJSON>,
    query: FindQueryJSON,
    replacement: String,
    current: Option<FindMatchJSON>,
}

#[derive(Serialize)]
struct FindPageJSON {
    total: usize,
    matches: Vec<FindMatchJSON>,
}

#[derive(Serialize)]
struct ReplaceReportJSON {
    cells: usize,
    occurrences: usize,
}

impl FindTargetJSON {
    fn native(&self) -> (usize, CellRange) {
        (
            self.sheet,
            CellRange::new(
                CellAddress::new(self.row_start, self.col_start),
                CellAddress::new(self.row_end, self.col_end),
            ),
        )
    }
}

impl FindQueryJSON {
    fn native(self) -> FindQuery {
        FindQuery {
            needle: self.needle,
            case_sensitive: self.case_sensitive,
            whole_cell: self.whole_cell,
            wildcards: self.wildcards,
            look_in: match self.look_in {
                FindLookInJSON::Values => FindLookIn::Values,
                FindLookInJSON::Formulas => FindLookIn::Formulas,
            },
        }
    }
}

impl From<FindMatch> for FindMatchJSON {
    fn from(value: FindMatch) -> Self {
        Self {
            sheet: value.sheet,
            row: value.address.row,
            col: value.address.col,
            start: value.start,
            end: value.end,
        }
    }
}

#[wasm_bindgen]
impl WasmWorkbook {
    pub fn find_cells(&self, request: JsValue) -> Result<JsValue, JsValue> {
        let request: FindRequestJSON = serde_wasm_bindgen::from_value(request)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        let targets: Vec<_> = request.targets.iter().map(FindTargetJSON::native).collect();
        let page = self
            .workbook
            .find_cells(
                &targets,
                &request.query.native(),
                request.offset,
                request.limit,
            )
            .map_err(JsValue::from_str)?;
        serde_wasm_bindgen::to_value(&FindPageJSON {
            total: page.total,
            matches: page.matches.into_iter().map(FindMatchJSON::from).collect(),
        })
        .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    pub fn replace_by_query(&mut self, request: JsValue) -> Result<JsValue, JsValue> {
        let request: ReplaceRequestJSON = serde_wasm_bindgen::from_value(request)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        let targets: Vec<_> = request.targets.iter().map(FindTargetJSON::native).collect();
        let current = request.current.map(|value| FindMatch {
            sheet: value.sheet,
            address: CellAddress::new(value.row, value.col),
            start: value.start,
            end: value.end,
        });
        let report = self
            .history
            .replace_by_query(
                &mut self.workbook,
                &targets,
                &request.query.native(),
                &request.replacement,
                current.as_ref(),
            )
            .map_err(JsValue::from_str)?;
        serde_wasm_bindgen::to_value(&ReplaceReportJSON {
            cells: report.cells,
            occurrences: report.occurrences,
        })
        .map_err(|e| JsValue::from_str(&e.to_string()))
    }
}
