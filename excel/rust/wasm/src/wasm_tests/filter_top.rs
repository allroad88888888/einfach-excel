#[test]
fn top_filter_wire_roundtrip_uses_one_typed_shape_for_all_scopes() {
    let top = serde_json::json!({"kind":"top","colIndex":1,"direction":"bottom",
        "unit":"percent","value":50});
    let rule: ColumnFilterRuleJSON = serde_json::from_value(top.clone()).unwrap();
    let native = rule.into_rule();
    assert_eq!(serde_json::to_value(ColumnFilterRuleJSON::from_rule(&native)).unwrap(), top);
    let mut book = workbook_with_inventory_table();
    book.workbook.apply_table_filter("Inventory", &[native.clone()]).unwrap();
    let mut ordinary = top.clone();
    ordinary["colIndex"] = serde_json::json!(3);
    let ordinary: ColumnFilterRuleJSON = serde_json::from_value(ordinary).unwrap();
    book.workbook.apply_filter_range(0,
        CellRange::new(CellAddress::new(0, 3), CellAddress::new(3, 3)),
        &[ordinary.into_rule()]).unwrap();
    book.workbook.hide_rows(0, &[8]);
    let before = serde_json::to_value(book.snapshot_persistence_v1_json()).unwrap();
    let mut restored = WasmWorkbook::new();
    restored.restore_persistence_v1_json(serde_json::from_value(before.clone()).unwrap()).unwrap();
    let after = serde_json::to_value(restored.snapshot_persistence_v1_json()).unwrap();
    assert_eq!(after["filters"], before["filters"]);
    assert_eq!(after["tables"], before["tables"]);
    assert_eq!(after["hidden"], before["hidden"]);
    assert_eq!(restored.workbook.debug_filter_scan_count(0), 0);
    restored.workbook.reapply_table_filter("Inventory").unwrap();
}

#[test]
fn invalid_top_wire_and_restored_amounts_are_rejected_atomically() {
    let mut book = workbook_with_inventory_table();
    let saved = serde_json::to_value(book.snapshot_persistence_v1_json()).unwrap();
    for (unit, value) in [("items", 0), ("items", 501), ("percent", 0),
        ("percent", 101), ("percent", 256), ("percent", 65535)] {
        let rule = serde_json::json!({"kind":"top","colIndex":1,"direction":"top", "unit":unit,"value":value});
        for table in [false, true] {
            let mut invalid = saved.clone();
            let filter = serde_json::json!({"rules":[rule.clone()],"hiddenRows":[1]});
            if table { invalid["tables"][0]["autoFilter"] = filter; }
            else {
                invalid["filters"] = serde_json::json!([{"sheet":0,
                    "rules":[rule.clone()],"hiddenRows":[1]}]);
            }
            assert!(book.restore_persistence_v1_json(serde_json::from_value(invalid).unwrap()).is_err(),
                "{unit} {value} table={table}");
            assert_eq!(serde_json::to_value(book.snapshot_persistence_v1_json()).unwrap(), saved);
        }
    }
    for (field, value) in [("direction", serde_json::json!("sideways")),
        ("unit", serde_json::json!("rows")), ("value", serde_json::json!(-1)),
        ("value", serde_json::json!(1.5)), ("value", serde_json::json!(null))] {
        let mut invalid = serde_json::json!({"kind":"top","colIndex":1,"direction":"top","unit":"items","value":10});
        invalid[field] = value;
        assert!(serde_json::from_value::<ColumnFilterRuleJSON>(invalid).is_err());
    }
}
