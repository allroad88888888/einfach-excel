// JSON action 解码后复用 Table 原生事务，保存恢复仍只存 Rust 数据。
#[test]
fn table_append_wire_history_restore_and_rejections() {
    let mut book = workbook_with_inventory_table();
    book.workbook.set_table_totals_row("Inventory", true).unwrap();
    book.workbook.set_cell(0, "B6", Value::Text("Neighbor".into()));
    let append = |count| serde_json::from_value(serde_json::json!({
        "kind":"append-row", "name":"Inventory", "rowCount":count,
    })).unwrap();
    let before = serde_json::to_value(book.snapshot_persistence_v1_json()).unwrap();
    assert!(book.apply_table_action(0, append(100)).unwrap());
    assert_eq!(book.workbook.get_table("Inventory").unwrap().range().end.row, 5);
    assert_eq!(book.workbook.get_cell("Sheet1", "B7"), Value::Text("Neighbor".into()));
    assert_eq!(book.history.undo_count(), 1);
    let after = serde_json::to_value(book.snapshot_persistence_v1_json()).unwrap();
    book.history.undo(&mut book.workbook).unwrap();
    assert_eq!(serde_json::to_value(book.snapshot_persistence_v1_json()).unwrap(), before);
    book.history.redo(&mut book.workbook).unwrap();
    assert_eq!(serde_json::to_value(book.snapshot_persistence_v1_json()).unwrap(), after);
    let mut restored = WasmWorkbook::new();
    restored.restore_persistence_v1_json(serde_json::from_value(after).unwrap()).unwrap();
    assert_eq!(restored.history.undo_count(), 0);
    restored.apply_table_action(0, append(100)).unwrap();
    assert_eq!(restored.workbook.get_table("Inventory").unwrap().range().end.row, 6);
    restored.workbook.add_sheet("Other");
    let saved = serde_json::to_value(restored.snapshot_persistence_v1_json()).unwrap();
    assert!(restored.apply_table_action(1, append(100)).unwrap_err().contains("another worksheet"));
    for count in [0, 6, 7, 1_048_577] {
        assert!(restored.apply_table_action(0, append(count)).is_err());
        assert_eq!(serde_json::to_value(restored.snapshot_persistence_v1_json()).unwrap(), saved);
    }
    assert_eq!(restored.history.undo_count(), 1);
}
