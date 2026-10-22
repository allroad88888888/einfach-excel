// 宿主协议只暴露原始值与一次原生事务；不复用会清历史的 bulk import。
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct HostRangeJSON {
    row_start: u32,
    row_end: u32,
    col_start: u32,
    col_end: u32,
}

impl HostRangeJSON {
    fn range(&self) -> CellRange {
        CellRange::new(CellAddress::new(self.row_start, self.col_start),
            CellAddress::new(self.row_end, self.col_end))
    }
    fn from_range(range: CellRange) -> Self {
        Self { row_start: range.start.row, row_end: range.end.row,
            col_start: range.start.col, col_end: range.end.col }
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct HostReadTargetJSON { sheet: usize, range: HostRangeJSON }

#[derive(Serialize)]
struct HostReadResultJSON {
    sheet: usize,
    range: HostRangeJSON,
    cells: Vec<einfach_excel_core::host::RawWorkbookCell>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HostMutationChangeJSON { sheet_key: String, ranges: Vec<HostRangeJSON> }

#[derive(Serialize)]
struct HostMutationJSON { sequence: u64, changes: Vec<HostMutationChangeJSON> }

#[wasm_bindgen]
impl WasmWorkbook {
    pub fn host_read_ranges(&self, targets: JsValue) -> Result<JsValue, JsValue> {
        let targets: Vec<HostReadTargetJSON> = serde_wasm_bindgen::from_value(targets)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        if targets.len() > 64 { return Err(JsValue::from_str("HOST_READ_BUDGET_EXCEEDED")); }
        let mut out = Vec::new();
        let mut count = 0;
        let mut bytes = 0;
        for target in targets {
            let cells = einfach_excel_core::host::read_range(&self.workbook, target.sheet,
                target.range.range()).map_err(JsValue::from_str)?;
            count += cells.len();
            bytes += cells.iter().map(|cell| cell.input.len() * 2 + 128).sum::<usize>();
            if count > einfach_excel_core::host::MAX_CELLS || bytes > einfach_excel_core::host::MAX_BYTES {
                return Err(JsValue::from_str("HOST_READ_BUDGET_EXCEEDED"));
            }
            out.push(HostReadResultJSON { sheet: target.sheet, range: target.range, cells });
        }
        serde_wasm_bindgen::to_value(&out).map_err(|error| JsValue::from_str(&error.to_string()))
    }

    pub fn host_write_cells(&mut self, cells: JsValue) -> Result<bool, JsValue> {
        let cells: Vec<einfach_excel_core::host::HostCellWrite> = serde_wasm_bindgen::from_value(cells)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        self.history.write_host_cells(&mut self.workbook, &cells).map_err(JsValue::from_str)
    }

    pub fn host_mutation_state(&self) -> Result<JsValue, JsValue> {
        let fact = self.history.last_mutation();
        let result = HostMutationJSON {
            sequence: self.history.mutation_sequence(),
            changes: fact.map(|fact| fact.changes.iter().map(|(key, ranges)| HostMutationChangeJSON {
                sheet_key: key.to_string(),
                ranges: ranges.iter().copied().map(HostRangeJSON::from_range).collect(),
            }).collect()).unwrap_or_default(),
        };
        serde_wasm_bindgen::to_value(&result).map_err(|error| JsValue::from_str(&error.to_string()))
    }
}
