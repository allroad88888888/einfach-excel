// 清除协议仅解码目标；全体预检、三种清除与一次历史由原生事务处理。
use einfach_excel_core::workbook_history::{ClearSelectionMode, WorkbookHistory};

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
enum ClearModeJSON { Contents, Formats, All }

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
enum ClearScopeJSON { Cell, Row, Column }

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ClearTargetJSON {
    row_start: u32,
    row_end: u32,
    col_start: u32,
    col_end: u32,
    scope: ClearScopeJSON,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ClearSelectionJSON {
    sheet: usize,
    targets: Vec<ClearTargetJSON>,
    mode: ClearModeJSON,
}

impl ClearSelectionJSON {
    fn apply(self, workbook: &mut Workbook, history: &mut WorkbookHistory) -> Result<CellRange, &'static str> {
        let targets: Vec<_> = self.targets.into_iter().map(|target| {
            let range = CellRange::new(CellAddress::new(target.row_start, target.col_start),
                CellAddress::new(target.row_end, target.col_end));
            let scope = match target.scope {
                ClearScopeJSON::Cell => StyleScope::Cell,
                ClearScopeJSON::Row => StyleScope::Row,
                ClearScopeJSON::Column => StyleScope::Column,
            };
            (range, scope)
        }).collect();
        let mode = match self.mode {
            ClearModeJSON::Contents => ClearSelectionMode::Contents,
            ClearModeJSON::Formats => ClearSelectionMode::Formats,
            ClearModeJSON::All => ClearSelectionMode::All,
        };
        history.clear_selection(workbook, self.sheet, &targets, mode)
    }
}

#[wasm_bindgen]
impl WasmWorkbook {
    pub fn clear_selection(&mut self, request: JsValue) -> Result<JsValue, JsValue> {
        let request: ClearSelectionJSON = serde_wasm_bindgen::from_value(request)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        let range = request.apply(&mut self.workbook, &mut self.history).map_err(JsValue::from_str)?;
        HistoryRangeJSON { row_start: range.start.row, row_end: range.end.row,
            col_start: range.start.col, col_end: range.end.col }
            .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }
}

#[cfg(test)]
mod clear_selection_wire_tests {
    use super::*;
    use serde_json::json;

    fn request() -> serde_json::Value {
        json!({ "sheet": 0, "mode": "contents", "targets": [
            { "rowStart": 0, "rowEnd": 0, "colStart": 0, "colEnd": 0, "scope": "cell" },
            { "rowStart": 2, "rowEnd": 2, "colStart": 0, "colEnd": 0, "scope": "cell" }
        ] })
    }

    #[test]
    fn all_modes_decode_and_execute_one_native_history_entry() {
        for mode in ["contents", "formats", "all"] {
            let mut input = request();
            input["mode"] = json!(mode);
            let mut book = Workbook::new();
            let mut history = WorkbookHistory::default();
            for address in ["A1", "A3"] {
                book.set_cell_input(0, address, "7").unwrap();
                book.sheet_mut(0).unwrap().set_format(address,
                    CellFormat { bold: true, ..Default::default() });
            }
            let decoded: ClearSelectionJSON = serde_json::from_value(input).unwrap();
            assert_eq!(decoded.apply(&mut book, &mut history).unwrap(),
                CellRange::new(CellAddress::new(0, 0), CellAddress::new(2, 0)));
            assert_eq!(history.undo_count(), 1);
            assert_eq!(book.sheet(0).unwrap().get_format("A3").bold, mode == "contents");
            history.undo(&mut book).unwrap();
            assert_eq!(book.get_cell("Sheet1", "A3"), Value::Number(7.0));
            assert!(book.sheet(0).unwrap().get_format("A3").bold);
        }
    }

    #[test]
    fn wire_rejects_unknown_modes_scopes_fields_and_non_integer_coordinates() {
        for (field, value) in [("mode", json!("unknown")), ("sheet", json!(-1)), ("extra", json!(1))] {
            let mut input = request();
            input[field] = value;
            assert!(serde_json::from_value::<ClearSelectionJSON>(input).is_err());
        }
        for (field, value) in [("scope", json!("unknown")), ("rowStart", json!(-1)),
            ("rowEnd", json!(0.5)), ("extra", json!(true))] {
            let mut input = request();
            input["targets"][1][field] = value;
            assert!(serde_json::from_value::<ClearSelectionJSON>(input).is_err());
        }
    }
}
