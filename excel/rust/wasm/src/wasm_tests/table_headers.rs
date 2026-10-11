// 真实 Table action 与 JSON 恢复共用原生表头事务，不依赖界面隐藏状态。
#[test]
fn table_headers_wire_history_and_persistence() {
    let mut book = workbook_with_inventory_table();
    book.workbook.set_formula(0, "E1", "=Inventory[#Headers]");
    let hide = serde_json::from_value(serde_json::json!({
        "kind":"header-row", "name":"Inventory", "enabled":false,
    })).unwrap();
    assert!(book.apply_table_action(0, hide).unwrap());
    assert_eq!(book.history.undo_count(), 1);
    assert_eq!(book.workbook.get_cell("Sheet1", "F1"), Value::Number(0.));
    let snapshot = serde_json::to_value(book.snapshot_persistence_v1_json()).unwrap();
    let mut restored = WasmWorkbook::new();
    restored.restore_persistence_v1_json(serde_json::from_value(snapshot).unwrap()).unwrap();
    assert!(!restored.workbook.get_table("Inventory").unwrap().has_headers());
    assert_eq!(restored.history.undo_count(), 0);
    assert_eq!(restored.workbook.get_cell("Sheet1", "F1"), Value::Number(0.));
    restored.workbook.rename_table_column("Inventory", "Qty", "Quantity").unwrap();
    let show = serde_json::from_value(serde_json::json!({
        "kind":"header-row", "name":"Inventory", "enabled":true,
    })).unwrap();
    assert!(restored.apply_table_action(0, show).unwrap());
    assert_eq!(restored.workbook.get_cell("Sheet1", "B1"), Value::Text("Quantity".into()));
    assert_eq!(restored.workbook.get_cell("Sheet1", "F1"), Value::Text("Quantity".into()));
    restored.history.undo(&mut restored.workbook).unwrap();
    assert_eq!(restored.workbook.get_cell("Sheet1", "B1"), Value::Null);
    assert_eq!(restored.workbook.get_cell("Sheet1", "B2"), Value::Number(1.));
    restored.history.redo(&mut restored.workbook).unwrap();
    assert!(restored.workbook.get_table("Inventory").unwrap().has_headers());
}

#[test]
fn table_headers_wrong_sheet_is_rejected_before_mutation() {
    let mut book = workbook_with_inventory_table();
    book.workbook.add_sheet("Other");
    let before = serde_json::to_value(book.snapshot_persistence_v1_json()).unwrap();
    let action = serde_json::from_value(serde_json::json!({
        "kind":"header-row", "name":"Inventory", "enabled":false,
    })).unwrap();
    assert!(book.apply_table_action(1, action).unwrap_err().contains("another worksheet"));
    assert_eq!(serde_json::to_value(book.snapshot_persistence_v1_json()).unwrap(), before);
    assert_eq!(book.history.undo_count(), 0);
}
