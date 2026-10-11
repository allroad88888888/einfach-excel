#[test]
fn filter_values_wire_returns_a_page_without_changing_history() {
    let mut wb = WasmWorkbook::new();
    wb.set_text(0, "A1", "Category");
    for row in 2..=5 { wb.set_text(0, &format!("A{row}"), if row < 4 { "First" } else { "Second" }); }
    let request: FilterValuesRequestJSON = serde_json::from_value(serde_json::json!({
        "sheet": 0, "column": 0, "search": "sec", "offset": 0, "limit": 1,
    })).unwrap();
    let undo = wb.history.undo_count();
    let json = serde_json::to_value(FilterValuesPageJSON::from(request.query(&wb.workbook).unwrap())).unwrap();
    assert_eq!(json, serde_json::json!({ "values": [{ "value": "Second", "count": 2 }], "total": 1, "offset": 0 }));
    assert_eq!(wb.history.undo_count(), undo);
    assert!(wb.workbook.filter_hidden_rows(0).is_empty());
}

#[test]
fn filter_values_wire_rejects_bad_coordinates_pages_and_unknown_fields() {
    for patch in [serde_json::json!({"column": -1}), serde_json::json!({"offset": 0.5}),
        serde_json::json!({"limit": "50"}), serde_json::json!({"unexpected": true})] {
        let mut value = serde_json::json!({"sheet": 0, "column": 0, "limit": 50});
        value.as_object_mut().unwrap().extend(patch.as_object().unwrap().clone());
        assert!(serde_json::from_value::<FilterValuesRequestJSON>(value).is_err());
    }
    let wb = Workbook::new();
    let request: FilterValuesRequestJSON = serde_json::from_value(serde_json::json!({
        "sheet": 0, "column": 0, "table": "Missing", "limit": 50,
    })).unwrap();
    assert!(request.query(&wb).is_err());
}
