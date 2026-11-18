#[test]
fn rich_import_preflight_preserves_normal_and_rejects_inconsistent_new_payloads() {
    let book = Workbook::new();
    let mut valid: Vec<WorkbookImportCellJSON> = serde_json::from_value(serde_json::json!([
        {"sheet":0,"row":0,"col":0,"kind":"text","value":"x2","richText":[
            {"text":"x","format":{}}, {"text":"2","format":{"fontBaseline":"normal","color":"#aa0000"}}
        ]}, {"sheet":0,"row":1,"col":0,"kind":"number","value":12}
    ])).unwrap();
    validate_imported_rich_text(&book, &mut valid).unwrap();
    let run = &valid[0].rich_text.as_ref().unwrap()[1];
    assert_eq!(run.format.font_baseline, Some(einfach_excel_core::FontBaseline::Normal));
    assert_eq!(run.format.color.as_deref(), Some("#AA0000"));
    assert!(valid[1].rich_text.is_none());
    for cell in [
        serde_json::json!({"sheet":0,"row":0,"col":0,"kind":"text","value":"x2","richText":[{"text":"wrong"}]}),
        serde_json::json!({"sheet":0,"row":0,"col":0,"kind":"number","value":12,"richText":[]}),
        serde_json::json!({"sheet":0,"row":0,"col":0,"kind":"text","value":"x2","richText":[]}),
        serde_json::json!({"sheet":0,"row":0,"col":0,"kind":"text","value":2,"richText":[]}),
        serde_json::json!({"sheet":9,"row":0,"col":0,"kind":"text","value":"","richText":[]}),
        serde_json::json!({"sheet":0,"row":0,"col":16384,"kind":"text","value":"","richText":[]}),
    ] {
        let mut cells = serde_json::from_value::<Vec<WorkbookImportCellJSON>>(serde_json::json!([
            {"sheet":0,"row":2,"col":0,"kind":"text","value":"Earlier entry"}, cell
        ])).unwrap();
        assert!(validate_imported_rich_text(&book, &mut cells).is_err());
        assert_eq!(book.sheet(0).unwrap().peek_value(CellAddress::new(2, 0)), Value::Null);
    }
    assert!(serde_json::from_value::<WorkbookImportCellJSON>(serde_json::json!({
        "sheet":0,"row":0,"col":0,"kind":"text","value":"x","richText":[
            {"text":"x","format":{"fontBaseline":"raised"}}]
    })).is_err());
}
