fn duplicates_wire_request() -> serde_json::Value {
    serde_json::json!({ "sheet": 0,
        "range": {"rowStart": 0, "colStart": 0, "rowEnd": 399, "colEnd": 2},
        "columns": [0, 2], "hasHeader": true, "comparison": "trimIgnoreCase",
        "rowCount": 1000, "colCount": 16 })
}

#[test]
fn duplicate_request_maps_full_range_and_options_without_scanning_in_js() {
    let wire: RemoveDuplicatesRequestJSON = serde_json::from_value(duplicates_wire_request()).unwrap();
    assert_eq!(wire.sample_offset, 0);
    let native = wire.native();
    assert_eq!(native.range.end, CellAddress::new(399, 2));
    assert_eq!(native.columns, vec![0, 2]);
    assert!(native.has_header);
    assert_eq!(native.comparison, DuplicateComparison::TrimIgnoreCase);
}

#[test]
fn duplicate_wire_rejects_unknown_options_and_malformed_coordinates() {
    for (key, value) in [("hasHeader", serde_json::json!(1)), ("comparison", serde_json::json!("locale")),
        ("columns", serde_json::json!([-1])), ("columns", serde_json::json!([0.5])),
        ("extra", serde_json::json!(true)), ("sampleOffset", serde_json::json!(-1)),
        ("sampleOffset", serde_json::json!(0.5))] {
        let mut request = duplicates_wire_request(); request[key] = value;
        assert!(serde_json::from_value::<RemoveDuplicatesRequestJSON>(request).is_err());
    }
}

#[test]
fn duplicate_wire_preview_preserves_counts_source_rows_and_bounded_samples() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Text("Header".into()));
    wb.set_cell(0, "A2", Value::Text("One".into()));
    wb.set_cell(0, "A3", Value::Text(" one ".into()));
    let wire: RemoveDuplicatesRequestJSON = serde_json::from_value(duplicates_wire_request()).unwrap();
    let preview = wb.preview_remove_duplicates(&wire.native()).unwrap();
    let result = serde_json::to_value(RemoveDuplicatesPreviewJSON::from(preview)).unwrap();
    assert_eq!(result["scannedRows"], 399);
    assert_eq!(result["uniqueRows"], 2);
    assert_eq!(result["removedRows"], 397);
    assert_eq!(result["sample"][0]["row"], 2);
    assert_eq!(result["sample"][0]["firstRow"], 1);
    assert_eq!(result["sampleTruncated"], true);
    assert_eq!(result["sampleOffset"], 0);
    assert_eq!(wb.get_cell("Sheet1", "A3"), Value::Text(" one ".into()));
}

#[test]
fn duplicate_wire_page_offset_round_trips_without_becoming_a_row_coordinate() {
    let wb = Workbook::new();
    let mut json = duplicates_wire_request();
    json["sampleOffset"] = serde_json::json!(20);
    let wire: RemoveDuplicatesRequestJSON = serde_json::from_value(json).unwrap();
    let offset = wire.sample_offset as usize;
    let page = wb.preview_remove_duplicates_page(&wire.native(), offset).unwrap();
    let result = serde_json::to_value(RemoveDuplicatesPreviewJSON::from(page)).unwrap();
    assert_eq!(result["sampleOffset"], 20);
    assert_eq!(result["sample"][0]["row"], 22);
    assert_eq!(result["sample"][0]["firstRow"], 1);
    assert_eq!(result["removedRows"], 398);
}
