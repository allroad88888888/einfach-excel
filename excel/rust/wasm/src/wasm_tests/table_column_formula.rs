// 只验证计算列定义的 wire/persistence；自动填充由后续编辑事务接线验证。
#[test]
fn calculated_column_definition_round_trips_with_table_persistence() {
    let mut book = workbook_with_inventory_table();
    let table = book.workbook.get_table("Inventory").unwrap().clone();
    let mut definitions = vec![None; table.columns().len()];
    definitions[1] = Some(einfach_excel_core::TableColumnFormula::new(1, "=A2*2").unwrap());
    book.workbook.restore_tables(TableRegistrySnapshot::from_entries(vec![
        table.with_calculated_columns(definitions.clone()),
    ])).unwrap();
    let snapshot = book.snapshot_persistence_v1_json();
    let json = serde_json::to_value(&snapshot).unwrap();
    assert_eq!(json["tables"][0]["calculatedColumns"][1],
        serde_json::json!({"row":1,"formula":"=(A2*2)"}));
    let mut restored = WasmWorkbook::new();
    restored.restore_persistence_v1_json(snapshot).unwrap();
    assert_eq!(restored.workbook.get_table("Inventory").unwrap().calculated_columns(), definitions);
}

#[test]
fn old_table_wire_has_no_calculated_columns_and_bad_metadata_is_rejected() {
    let mut book = workbook_with_inventory_table();
    let mut json = serde_json::to_value(&book.tables_json()[0]).unwrap();
    assert!(json.get("calculatedColumns").is_none());
    let old: TableJSON = serde_json::from_value(json.clone()).unwrap();
    assert!(old.into_entry().unwrap().calculated_columns().is_empty());
    for invalid in [
        serde_json::json!([{"row":0,"formula":"=SUM("}]),
        serde_json::json!([{"row":1_048_576,"formula":"=1"}]),
        serde_json::json!([{"row":0,"formula":"=1","value":1}]),
    ] {
        json["calculatedColumns"] = invalid;
        assert!(serde_json::from_value::<TableJSON>(json.clone()).is_err());
    }
    let before = book.workbook.snapshot_tables();
    for misaligned in [serde_json::json!([null]),
        serde_json::json!([{"row":1,"formula":"=A2*2"}])] {
        json["calculatedColumns"] = misaligned;
        let entry: TableJSON = serde_json::from_value(json.clone()).unwrap();
        assert!(book.restore_tables_json(TableRegistrySnapshotJSON {
            version: 1, tables: vec![entry],
        }).is_err());
        assert_eq!(book.workbook.snapshot_tables(), before);
    }
}
