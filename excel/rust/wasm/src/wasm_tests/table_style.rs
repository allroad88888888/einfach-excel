// 浏览器命令、原生目录和持久化共用同一个配置，不保存逐格派生颜色。
#[test]
fn table_style_wire_history_and_persistence_round_trip() {
    let mut book = workbook_with_inventory_table();
    let action = serde_json::from_value(serde_json::json!({
        "kind": "style", "name": "Inventory",
        "style": { "preset": "green", "bandedRows": false, "firstColumn": true }
    })).unwrap();
    assert!(book.apply_table_action(0, action).unwrap());
    let style = book.workbook.get_table("Inventory").unwrap().style();
    assert_eq!(style.preset, einfach_excel_core::TableStylePreset::Green);
    assert!(!style.banded_rows);
    assert!(style.first_column);
    assert_eq!(book.history.undo_count(), 1);
    let snapshot = book.snapshot_persistence_v1_json();
    let json = serde_json::to_value(&snapshot).unwrap();
    assert_eq!(json["tables"][0]["style"]["preset"], "green");
    let mut restored = WasmWorkbook::new();
    restored.restore_persistence_v1_json(snapshot).unwrap();
    assert_eq!(restored.workbook.get_table("Inventory").unwrap().style(), style);
    let range = restored.workbook.get_table("Inventory").unwrap().range();
    assert_eq!(restored.workbook.snapshot_display_format_range(0, range).unwrap(),
        book.workbook.snapshot_display_format_range(0, range).unwrap());
    book.history.undo(&mut book.workbook).unwrap();
    assert_eq!(book.workbook.get_table("Inventory").unwrap().style(), Default::default());
    book.history.redo(&mut book.workbook).unwrap();
    assert_eq!(book.workbook.get_table("Inventory").unwrap().style(), style);
}

#[test]
fn old_table_snapshots_keep_their_appearance_and_unknown_styles_reject() {
    let book = workbook_with_inventory_table();
    let mut json = serde_json::to_value(&book.tables_json()[0]).unwrap();
    json.as_object_mut().unwrap().remove("style");
    let old: TableJSON = serde_json::from_value(json.clone()).unwrap();
    assert_eq!(old.into_entry().unwrap().style(), Default::default());
    for invalid in [
        serde_json::json!({ "preset": "unknown", "bandedRows": true, "firstColumn": false }),
        serde_json::json!({ "preset": "blue", "bandedRows": 1, "firstColumn": false }),
        serde_json::json!({ "preset": "blue", "bandedRows": true, "firstColumn": false, "height": 40 }),
    ] {
        json["style"] = invalid.clone();
        assert!(serde_json::from_value::<TableJSON>(json.clone()).is_err());
        assert!(serde_json::from_value::<TableActionJSON>(serde_json::json!({
            "kind": "style", "name": "Inventory", "style": invalid
        })).is_err());
    }
}

#[test]
fn table_style_wrong_sheet_rejects_without_mutation() {
    let mut book = workbook_with_inventory_table();
    book.workbook.add_sheet("Other");
    let before = book.workbook.snapshot_tables();
    let action = serde_json::from_value(serde_json::json!({
        "kind": "style", "name": "Inventory",
        "style": { "preset": "gray", "bandedRows": true, "firstColumn": true }
    })).unwrap();
    assert!(book.apply_table_action(1, action).unwrap_err().contains("another worksheet"));
    assert_eq!(book.workbook.snapshot_tables(), before);
    assert_eq!(book.history.undo_count(), 0);
}
