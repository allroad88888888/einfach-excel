fn consolidate_wire_request() -> serde_json::Value {
    serde_json::json!({
        "function": "sum",
        "sources": [
            { "sheet": 0, "range": { "rowStart": 0, "rowEnd": 2, "colStart": 0, "colEnd": 1 } },
            { "sheet": 1, "range": { "rowStart": 0, "rowEnd": 2, "colStart": 0, "colEnd": 1 } }
        ],
        "sheet": 2,
        "destination": { "row": 0, "col": 0 },
        "topRow": true,
        "leftColumn": true,
        "createLinks": false,
        "rowCount": 1000,
        "colCount": 26
    })
}

#[test]
fn consolidate_wire_maps_request_and_rejects_unknown_fields() {
    let wire: ConsolidateRequestJSON =
        serde_json::from_value(consolidate_wire_request()).unwrap();
    let native: ConsolidateRequest = wire.into();
    assert_eq!(native.function, ConsolidateFunction::Sum);
    assert_eq!(native.sources.len(), 2);
    assert!(native.top_row && native.left_column && !native.create_links);

    for (key, value) in [
        ("function", serde_json::json!("median")),
        ("topRow", serde_json::json!(1)),
        ("extra", serde_json::json!(true)),
    ] {
        let mut req = consolidate_wire_request();
        req[key] = value;
        assert!(serde_json::from_value::<ConsolidateRequestJSON>(req).is_err());
    }
}

#[test]
fn consolidate_wire_preview_and_apply_round_trip() {
    let mut wb = Workbook::new();
    wb.add_sheet("Q2");
    wb.add_sheet("Summary");
    wb.set_cell(0, "A1", Value::Text("Item".into()));
    wb.set_cell(0, "B1", Value::Text("Sales".into()));
    wb.set_cell(0, "A2", Value::Text("Apples".into()));
    wb.set_cell(0, "B2", Value::Number(10.0));
    wb.set_cell(1, "A1", Value::Text("Item".into()));
    wb.set_cell(1, "B1", Value::Text("Sales".into()));
    wb.set_cell(1, "A2", Value::Text("Apples".into()));
    wb.set_cell(1, "B2", Value::Number(25.0));

    let wire: ConsolidateRequestJSON =
        serde_json::from_value(consolidate_wire_request()).unwrap();
    let native: ConsolidateRequest = wire.into();
    let preview = wb.preview_consolidate(&native).unwrap();
    let json = serde_json::to_value(ConsolidatePreviewJSON::from(preview)).unwrap();
    assert_eq!(json["rowCount"], 2);
    assert_eq!(json["colCount"], 2);
    assert_eq!(json["overwrittenCells"], 0);
    assert_eq!(json["sampleTruncated"], false);
    assert_eq!(json["sample"][1][1], "35");

    let mut history = einfach_excel_core::workbook_history::WorkbookHistory::default();
    let report = history.consolidate(&mut wb, &native, None).unwrap();
    let report_json = serde_json::to_value(ConsolidateReportJSON::from(report)).unwrap();
    assert_eq!(report_json["changedCells"], 4);
    assert_eq!(report_json["linkedGroups"], 0);
    assert_eq!(wb.get_cell("Summary", "B2"), Value::Number(35.0));
}
