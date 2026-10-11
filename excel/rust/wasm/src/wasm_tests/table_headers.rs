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

#[test]
fn table_headers_insert_checks_the_view_canvas_and_keeps_the_original_row() {
    let mut book = workbook_with_inventory_table();
    let action = |enabled, count| serde_json::from_value(serde_json::json!({
        "kind":"header-row", "name":"Inventory", "enabled":enabled, "rowCount":count,
    })).unwrap();
    book.apply_table_action(0, action(false, 10)).unwrap();
    book.workbook.set_cell(0, "A1", Value::Text("Keep outside".into()));
    book.workbook.define_named_range("Body", 0,
        CellRange::new(CellAddress::new(1, 1), CellAddress::new(3, 1))).unwrap();
    book.workbook.add_sheet("Report");
    book.workbook.set_formula(1, "A1", "=Body");
    book.workbook.set_cell(0, "A6", Value::Text("Qty".into()));
    book.workbook.set_cell(0, "B6", Value::Text("Amount".into()));
    book.workbook.set_cell(0, "B7", Value::Number(10.));
    book.workbook.set_cell(0, "B8", Value::Number(12.));
    book.workbook.define_table(Some("LowerOrders"), 0,
        CellRange::new(CellAddress::new(5, 0), CellAddress::new(7, 1)), true).unwrap();
    book.workbook.set_formula(1, "D1", "=LowerOrders[Amount]");
    book.workbook.apply_filter_range(0,
        CellRange::new(CellAddress::new(5, 0), CellAddress::new(7, 1)),
        &[ColumnFilterRule::Range { col_index: 1, min: Some(11.), max: None }]).unwrap();
    let before = serde_json::to_value(book.snapshot_persistence_v1_json()).unwrap();
    assert!(book.apply_table_action(0, action(true, 4)).unwrap_err().contains("outside"));
    assert_eq!(serde_json::to_value(book.snapshot_persistence_v1_json()).unwrap(), before);
    assert_eq!(book.history.undo_count(), 1);
    book.apply_table_action(0, action(true, 10)).unwrap();
    assert_eq!(book.workbook.get_cell("Sheet1", "A1"), Value::Text("Keep outside".into()));
    assert_eq!(book.workbook.get_cell("Sheet1", "A2"), Value::Text("Name".into()));
    assert_eq!(book.workbook.get_cell("Sheet1", "B3"), Value::Number(1.));
    let snapshot = serde_json::to_value(book.snapshot_persistence_v1_json()).unwrap();
    let mut restored = WasmWorkbook::new();
    restored.restore_persistence_v1_json(serde_json::from_value(snapshot).unwrap()).unwrap();
    assert_eq!(restored.workbook.get_table("LowerOrders").unwrap().range(),
        CellRange::new(CellAddress::new(6, 0), CellAddress::new(8, 1)));
    assert_eq!(restored.workbook.get_cell("Report", "D2"), Value::Number(12.));
    assert_eq!(restored.workbook.filter_range(0),
        Some(CellRange::new(CellAddress::new(6, 0), CellAddress::new(8, 1))));
    assert_eq!(restored.workbook.filter_hidden_rows(0), vec![7]);
    restored.workbook.set_cell(0, "B9", Value::Number(18.));
    assert_eq!(restored.workbook.get_cell("Report", "D2"), Value::Number(18.));
    assert_eq!(restored.workbook.named_range("Body").unwrap().unwrap().1,
        CellRange::new(CellAddress::new(2, 1), CellAddress::new(4, 1)));
    assert_eq!(restored.workbook.get_cell("Report", "A2"),
        book.workbook.get_cell("Sheet1", "B4"));
    restored.workbook.set_cell(0, "B4", Value::Number(8.));
    assert_eq!(restored.workbook.get_cell("Report", "A2"), Value::Number(8.));
    book.history.undo(&mut book.workbook).unwrap();
    assert_eq!(serde_json::to_value(book.snapshot_persistence_v1_json()).unwrap(), before);
}
