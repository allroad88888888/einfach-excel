// 只解码一次多区域格式请求；属性继承、预检与历史全部交给原生事务。
#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
enum FormatSelectionScopeJSON { Cell, Row, Column }

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FormatSelectionTargetJSON {
    row_start: u32,
    row_end: u32,
    col_start: u32,
    col_end: u32,
    scope: FormatSelectionScopeJSON,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct FormatSelectionJSON {
    sheet: usize,
    targets: Vec<FormatSelectionTargetJSON>,
    patch: CellFormatJSON,
}

impl FormatSelectionJSON {
    fn apply(self, workbook: &mut Workbook, history: &mut WorkbookHistory) -> Result<CellRange, &'static str> {
        let targets: Vec<_> = self.targets.into_iter().map(|target| {
            let scope = match target.scope {
                FormatSelectionScopeJSON::Cell => StyleScope::Cell,
                FormatSelectionScopeJSON::Row => StyleScope::Row,
                FormatSelectionScopeJSON::Column => StyleScope::Column,
            };
            (CellRange::new(CellAddress::new(target.row_start, target.col_start),
                CellAddress::new(target.row_end, target.col_end)), scope)
        }).collect();
        history.patch_format_selection(workbook, self.sheet, &targets, self.patch.into_style())
    }
}

#[wasm_bindgen]
impl WasmWorkbook {
    pub fn patch_format_selection(&mut self, request: JsValue) -> Result<JsValue, JsValue> {
        let input: FormatSelectionJSON = serde_wasm_bindgen::from_value(request)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        let range = input.apply(&mut self.workbook, &mut self.history).map_err(JsValue::from_str)?;
        HistoryRangeJSON { row_start: range.start.row, row_end: range.end.row,
            col_start: range.start.col, col_end: range.end.col }
            .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }
}

#[cfg(test)]
mod format_selection_wire_tests {
    use super::*;
    use serde_json::json;

    fn request() -> serde_json::Value {
        json!({ "sheet": 0, "patch": { "bold": true, "fgColor": null,
            "numberFormat": { "kind": "percent", "digits": 2 } }, "targets": [
            { "rowStart": 0, "rowEnd": 0, "colStart": 0, "colEnd": 0, "scope": "cell" },
            { "rowStart": 2, "rowEnd": 2, "colStart": 2, "colEnd": 2, "scope": "cell" }
        ] })
    }

    #[test]
    fn patch_preserves_explicit_clear_and_number_format_for_all_targets_in_one_history() {
        let mut book = Workbook::new();
        let mut history = WorkbookHistory::default();
        for address in ["A1", "C3"] {
            book.sheet_mut(0).unwrap().set_format(address, CellFormat {
                color: Some("#ff0000".into()), italic: true, ..Default::default()
            });
        }
        let input: FormatSelectionJSON = serde_json::from_value(request()).unwrap();
        input.apply(&mut book, &mut history).unwrap();
        for address in ["A1", "C3"] {
            let format = book.sheet(0).unwrap().get_format(address);
            assert!(format.bold && format.italic);
            assert_eq!(format.color, None);
            assert_eq!(format.number_format, NumberFormat::Percent { digits: 2 });
        }
        assert_eq!(history.undo_count(), 1);
        history.undo(&mut book).unwrap();
        assert_eq!(book.sheet(0).unwrap().get_format("C3").color.as_deref(), Some("#ff0000"));
    }

    #[test]
    fn invalid_wire_scope_coordinates_and_extra_fields_do_not_decode() {
        for (field, value) in [("sheet", json!(-1)), ("extra", json!(true))] {
            let mut input = request();
            input[field] = value;
            assert!(serde_json::from_value::<FormatSelectionJSON>(input).is_err());
        }
        for (field, value) in [("scope", json!("invalid")), ("rowStart", json!(-1)),
            ("colEnd", json!(0.5)), ("extra", json!(true))] {
            let mut input = request();
            input["targets"][1][field] = value;
            assert!(serde_json::from_value::<FormatSelectionJSON>(input).is_err());
        }
    }
}
