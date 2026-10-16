#[test]
fn hyperlink_file_roundtrip_keeps_blank_cells_and_legacy_files_still_open() {
    let mut source = WasmWorkbook::new();
    source.set_text(0, "A1", "Customer");
    source.change_hyperlink(0, 0, 0, Some("https://example.com".into()), None).unwrap();
    source.change_hyperlink(0, 2, 1, Some("https://blank.example".into()), None).unwrap();
    let json = serde_json::to_value(source.snapshot_persistence_v1_json()).unwrap();
    assert_eq!(json["hyperlinks"].as_array().unwrap().len(), 2);
    let mut restored = WasmWorkbook::new();
    restored.restore_persistence_v1_json(serde_json::from_value(json.clone()).unwrap()).unwrap();
    assert_eq!(restored.workbook.sheet(0).unwrap().hyperlink(CellAddress::new(2, 1)), Some("https://blank.example/"));
    let mut cells = Vec::new();
    restored.append_empty_hyperlink_cells(0,
        CellRange::new(CellAddress::new(0, 0), CellAddress::new(4, 4)), &mut cells);
    assert!(cells.iter().any(|cell| cell.addr == "B3" && cell.display.is_empty()
        && cell.hyperlink.as_deref() == Some("https://blank.example/")));
    let mut legacy = json;
    legacy.as_object_mut().unwrap().remove("hyperlinks");
    restored.restore_persistence_v1_json(serde_json::from_value(legacy).unwrap()).unwrap();
    assert!(restored.hyperlinks_json().is_empty());
    assert_eq!(restored.get_display(0, "A1"), "Customer");
}

#[test]
fn malformed_link_metadata_does_not_replace_the_open_workbook() {
    let mut book = WasmWorkbook::new();
    book.set_text(0, "A1", "keep me");
    for links in [
        serde_json::json!([{ "sheet": 0, "row": 0, "col": 0, "url": "javascript:alert(1)" }]),
        serde_json::json!([{ "sheet": 5, "row": 0, "col": 0, "url": "https://example.com" }]),
        serde_json::json!([{ "sheet": 0, "row": 1048576, "col": 0, "url": "https://example.com" }]),
        serde_json::json!([
            { "sheet": 0, "row": 0, "col": 0, "url": "https://example.com" },
            { "sheet": 0, "row": 0, "col": 0, "url": "https://other.example" }
        ]),
    ] {
        let mut json = serde_json::to_value(book.snapshot_persistence_v1_json()).unwrap();
        json["hyperlinks"] = links;
        assert!(book.restore_persistence_v1_json(serde_json::from_value(json).unwrap()).is_err());
        assert_eq!(book.get_display(0, "A1"), "keep me");
        assert!(book.hyperlinks_json().is_empty());
    }
}
