#[test]
fn sort_options_wire_defaults_and_rejects_invalid_booleans() {
    let default: SortKeyWireJSON = serde_json::from_str(r#"{"col":0}"#).unwrap();
    let key = default.into_key();
    assert!(!key.case_sensitive && !key.empty_first);
    for field in ["caseSensitive", "emptyFirst"] {
        for bad in [serde_json::json!("true"), serde_json::json!(1), serde_json::Value::Null] {
            let mut json = serde_json::json!({"col": 0});
            json[field] = bad;
            assert!(serde_json::from_value::<SortKeyWireJSON>(json).is_err());
        }
    }
}

#[test]
fn sort_options_wire_reaches_native_permutation_and_undo_redo() {
    let mut wb = WasmWorkbook::new();
    wb.set_text(0, "A1", "cedar"); wb.set_text(0, "A2", "Birch");
    wb.set_text(0, "A3", "CEDAR");
    for row in 1..=4 { wb.set_number(0, &format!("B{row}"), row as f64); }
    let payload: SortRangePayloadJSON = serde_json::from_value(serde_json::json!({
        "range": "A1:B4", "keys": [{"col": 0, "caseSensitive": true, "emptyFirst": true}],
    })).unwrap();
    let range = payload.range.into_range().unwrap();
    let keys: Vec<_> = payload.keys.into_iter().map(SortKeyWireJSON::into_key).collect();
    wb.history.begin(&wb.workbook, 0, range, "Sort selection", true).unwrap();
    wb.workbook.sort_range(0, range, &keys, &[]).unwrap();
    wb.history.finish(&mut wb.workbook, true).unwrap();
    assert_eq!(wb.workbook.sheet(0).unwrap().get_cell("B1"), einfach_core::Value::Number(4.));
    assert_eq!(wb.workbook.sheet(0).unwrap().get_cell("B3"), einfach_core::Value::Number(3.));
    assert_eq!(wb.history.undo_count(), 1);
    wb.history.undo(&mut wb.workbook).unwrap();
    assert_eq!(wb.workbook.sheet(0).unwrap().get_cell("B1"), einfach_core::Value::Number(1.));
    wb.history.redo(&mut wb.workbook).unwrap();
    assert_eq!(wb.workbook.sheet(0).unwrap().get_cell("B1"), einfach_core::Value::Number(4.));
}
