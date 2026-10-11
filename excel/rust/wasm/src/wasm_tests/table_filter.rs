// 持久化保存隐藏快照，UI Table 目录只带条件；两者不混用。
fn table_filter_action(kind: &str) -> TableActionJSON {
    let mut action = serde_json::json!({"kind":kind,"name":"Inventory"});
    if kind == "filter" {
        action["rules"] = serde_json::json!([{"kind":"range","colIndex":1,"min":2}]);
    }
    serde_json::from_value(action).unwrap()
}

#[test]
fn table_filter_wire_commands_use_native_history_and_explicit_reapply() {
    let mut book = workbook_with_inventory_table();
    assert!(book.apply_table_action(0, table_filter_action("filter")).unwrap());
    assert_eq!(book.workbook.filter_hidden_rows(0), vec![1]);
    assert_eq!(book.history.undo_count(), 1);
    assert!(!book.apply_table_action(0, table_filter_action("filter")).unwrap());
    assert_eq!(book.history.undo_count(), 1);
    book.workbook.set_cell(0, "B2", Value::Number(5.));
    assert_eq!(book.workbook.filter_hidden_rows(0), vec![1]);
    assert!(book.apply_table_action(0, table_filter_action("reapply-filter")).unwrap());
    assert!(book.workbook.filter_hidden_rows(0).is_empty());
    book.history.undo(&mut book.workbook).unwrap();
    assert_eq!(book.workbook.filter_hidden_rows(0), vec![1]);
    assert!(book.apply_table_action(0, table_filter_action("clear-filter")).unwrap());
    assert!(book.workbook.get_table("Inventory").unwrap().auto_filter().is_none());
    assert!(!book.apply_table_action(0, table_filter_action("clear-filter")).unwrap());
    book.workbook.add_sheet("Other");
    assert!(book.apply_table_action(1, table_filter_action("filter")).is_err());
}

#[test]
fn table_filter_persistence_restores_snapshot_without_recomputing_changed_values() {
    let mut source = workbook_with_inventory_table();
    source.apply_table_action(0, table_filter_action("filter")).unwrap();
    source.workbook.set_cell(0, "B2", Value::Number(5.));
    source.workbook.set_formula(0, "E1", "=SUBTOTAL(9,Inventory[Qty])");
    let saved = serde_json::to_value(source.snapshot_persistence_v1_json()).unwrap();
    assert_eq!(saved["tables"][0]["autoFilter"]["hiddenRows"], serde_json::json!([1]));
    let projection = serde_json::to_value(source.table_projection_json().unwrap()).unwrap();
    assert_eq!(projection[0]["autoFilter"]["rules"], saved["tables"][0]["autoFilter"]["rules"]);
    assert!(projection[0]["autoFilter"].get("hiddenRows").is_none());
    let mut restored = WasmWorkbook::new();
    restored.restore_persistence_v1_json(serde_json::from_value(saved).unwrap()).unwrap();
    assert_eq!(restored.workbook.filter_hidden_rows(0), vec![1]);
    assert_eq!(restored.workbook.get_cell("Sheet1", "E1"), Value::Number(5.));
    assert_eq!(restored.workbook.debug_filter_scan_count(0), 0);
    assert_eq!(restored.history.undo_count(), 0);
    restored.apply_table_action(0, table_filter_action("reapply-filter")).unwrap();
    assert!(restored.workbook.filter_hidden_rows(0).is_empty());
    assert_eq!(restored.workbook.get_cell("Sheet1", "E1"), Value::Number(10.));
}

#[test]
fn malformed_table_filter_restore_is_atomic_and_legacy_tables_still_load() {
    let mut source = workbook_with_inventory_table();
    let saved = serde_json::to_value(source.snapshot_persistence_v1_json()).unwrap();
    assert!(saved["tables"][0].get("autoFilter").is_none());
    for (column, hidden) in [(1, 0), (1, 4), (5, 1)] {
        let mut broken = saved.clone();
        broken["tables"][0]["autoFilter"] = serde_json::json!({
            "rules":[{"kind":"range","colIndex":column,"min":2}],"hiddenRows":[hidden],
        });
        assert!(source.restore_persistence_v1_json(serde_json::from_value(broken).unwrap()).is_err());
        assert_eq!(serde_json::to_value(source.snapshot_persistence_v1_json()).unwrap(), saved);
    }
    source.restore_persistence_v1_json(serde_json::from_value(saved).unwrap()).unwrap();
    assert!(source.workbook.get_table("Inventory").unwrap().auto_filter().is_none());
}
