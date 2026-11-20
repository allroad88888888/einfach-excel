#[test]
fn custom_sort_list_wire_validates_shared_limits_and_locale_before_mutation() {
    let key = |list| serde_json::from_value::<SortKeyWireJSON>(
        serde_json::json!({"col": 0, "list": list}));
    for bad in [serde_json::json!(["a", "b"]), serde_json::json!({"values": ["a", "b"]}),
        serde_json::json!({"values": [1, 2], "locale": "en"})] {
        assert!(key(bad).is_err());
    }
    for (values, locale) in [(vec!["a", "A"], "en"), (vec!["a", "b"], "EN"),
        (vec!["a", " "], "en"), (vec!["one"], "en"), (vec!["I", "ı"], "tr")] {
        assert!(key(serde_json::json!({"values": values, "locale": locale})).unwrap().into_key().is_err());
    }
    let values = (0..512).map(|i| format!("item-{i}")).collect::<Vec<_>>();
    assert!(key(serde_json::json!({"values": values, "locale": "zh-Hans-CN"}))
        .unwrap().into_key().is_ok());
}

#[test]
fn custom_sort_list_wire_reaches_native_history_and_preserves_formula_records() {
    let mut wb = WasmWorkbook::new();
    for (row, text) in [(1, "i"), (2, "ı"), (3, "I"), (4, "other")] {
        wb.set_text(0, &format!("A{row}"), text);
        wb.workbook.sheet_mut(0).unwrap().set_formula(&format!("B{row}"), &format!("={row}*10"));
    }
    let payload: SortRangePayloadJSON = serde_json::from_value(serde_json::json!({
        "range": "A1:B4", "keys": [{"col": 0, "list": {"values": ["I", "İ"], "locale": "tr"}}],
    })).unwrap();
    let range = payload.range.into_range().unwrap();
    let keys = payload.keys.into_iter().map(SortCriterionWireJSON::into_criterion)
        .collect::<Result<Vec<_>, _>>().unwrap();
    wb.history.begin(&wb.workbook, 0, range, "Sort selection", true).unwrap();
    wb.workbook.sort_range_by_criteria(0, range, &keys, &[]).unwrap();
    wb.history.finish(&mut wb.workbook, true).unwrap();
    assert_eq!(wb.workbook.sheet(0).unwrap().get_cell("A1"), einfach_core::Value::Text("ı".into()));
    assert_eq!(wb.workbook.sheet(0).unwrap().get_cell("B1"), einfach_core::Value::Number(20.));
    assert_eq!(wb.workbook.sheet(0).unwrap().get_cell("A4"), einfach_core::Value::Text("other".into()));
    assert_eq!(wb.history.undo_count(), 1);
    wb.history.undo(&mut wb.workbook).unwrap();
    assert_eq!(wb.workbook.sheet(0).unwrap().get_cell("B1"), einfach_core::Value::Number(10.));
    wb.history.redo(&mut wb.workbook).unwrap();
    assert_eq!(wb.workbook.sheet(0).unwrap().get_cell("B1"), einfach_core::Value::Number(20.));
}
