#[test]
fn named_list_wire_keeps_bounded_candidate_metadata_and_native_owns_values() {
    let payload = serde_json::json!({ "sheet": 0,
        "sourceRange": {"startRow": 0, "endRow": 1, "startCol": 0, "endCol": 0},
        "targetRange": {"startRow": 0, "endRow": 3, "startCol": 0, "endCol": 0},
        "direction": "down", "series": "copy", "infer": true,
        "namedLists": [{"kind": "custom-list", "listName": "user:Priority",
            "values": ["Low", "Medium", "High"], "locale": "en"}]
    });
    let wire: AutoFillRequestJSON = serde_json::from_value(payload.clone()).unwrap();
    let request: AutoFillRequest = wire.try_into().unwrap();
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Text("Medium".into()));
    wb.set_cell(0, "A2", Value::Text("High".into()));
    wb.apply_inferred_auto_fill(&request).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A3"), Value::Text("Low".into()));
    for (key, bad) in [
        ("kind", serde_json::json!("integer-step")),
        ("extra", serde_json::json!(true)),
    ] {
        let mut invalid = payload.clone();
        invalid["namedLists"][0][key] = bad;
        assert!(serde_json::from_value::<AutoFillRequestJSON>(invalid).is_err());
    }
    for (key, bad) in [
        ("listName", serde_json::json!("user:builtin-weekday-short")),
        ("values", serde_json::json!(["Low", "LOW"])),
    ] {
        let mut invalid = payload.clone();
        invalid["namedLists"][0][key] = bad;
        let wire: AutoFillRequestJSON = serde_json::from_value(invalid).unwrap();
        assert!(AutoFillRequest::try_from(wire).is_err());
    }
    let mut too_many = payload;
    too_many["namedLists"] = serde_json::Value::Array(vec![too_many["namedLists"][0].clone(); 67]);
    let wire: AutoFillRequestJSON = serde_json::from_value(too_many).unwrap();
    assert!(AutoFillRequest::try_from(wire).is_err());
}
