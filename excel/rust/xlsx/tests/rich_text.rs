use serde_json::{json, Value};

fn rich_cells(file: &Value) -> Vec<Value> {
    let mut cells = file["workbook"]["richText"].as_array().unwrap().clone();
    cells.sort_by_key(|cell| (cell["sheet"].as_u64(), cell["row"].as_u64(), cell["col"].as_u64()));
    cells
}

#[test]
fn imports_inline_runs_and_preserves_them_through_xlsx_export() {
    let bytes = std::fs::read("tests/fixtures/edge_cases.xlsx").unwrap();
    let (text, report) = einfach_xlsx::xlsx_to_native_with_report(bytes, "rich").unwrap();
    let original: Value = serde_json::from_str(&text).unwrap();
    assert!(!report.items.iter().any(|item| item.kind == "richText"));
    let expected = vec![
        json!({"sheet": 0, "row": 1, "col": 0, "runs": [
            {"text": "Bold ", "format": {"bold": true, "color": "#ff0000"}},
            {"text": "plain", "format": {}}
        ]}),
        json!({"sheet": 0, "row": 3, "col": 0, "runs": [
            {"text": "Inline ", "format": {"italic": true}},
            {"text": "rich", "format": {}}
        ]}),
    ];
    assert_eq!(rich_cells(&original), expected);

    let exported = einfach_xlsx::native_to_xlsx(&text).unwrap();
    let reopened: Value = serde_json::from_str(
        &einfach_xlsx::xlsx_to_native(exported, "reopened").unwrap(),
    ).unwrap();
    assert_eq!(rich_cells(&reopened), expected);
    for cell in &expected {
        let address = format!("A{}", cell["row"].as_u64().unwrap() + 1);
        let value = reopened["workbook"]["cells"].as_array().unwrap().iter()
            .find(|candidate| candidate["sheet"] == 0 && candidate["addr"] == address).unwrap();
        let text: String = cell["runs"].as_array().unwrap().iter()
            .map(|run| run["text"].as_str().unwrap()).collect();
        assert_eq!(value["value"], text);
    }
}
