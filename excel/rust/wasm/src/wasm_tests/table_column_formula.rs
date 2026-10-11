// 计算列定义沿既有 wire 保存恢复，恢复后仍可通过真实输入绑定继承/更新。
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

#[test]
fn renamed_calculated_column_restores_and_continues_through_the_input_binding() {
    let mut book = workbook_with_inventory_table();
    book.set_cell_input(0, "C3", "=Inventory[@Qty]*2").unwrap();
    assert_eq!(book.workbook.get_cell("Sheet1", "C2"), Value::Number(2.));
    assert_eq!(book.workbook.get_cell("Sheet1", "C4"), Value::Number(6.));
    for action in [
        serde_json::json!({"kind":"rename","name":"Inventory","newName":"Sales"}),
        serde_json::json!({"kind":"rename-column","name":"Sales","column":"Qty","newName":"Units"}),
    ] {
        book.apply_table_action(0, serde_json::from_value(action).unwrap()).unwrap();
    }
    let json = serde_json::to_string(&book.snapshot_persistence_v1_json()).unwrap();
    let mut restored = WasmWorkbook::new();
    restored.restore_persistence_v1_json(serde_json::from_str(&json).unwrap()).unwrap();
    assert_eq!(restored.history.undo_count(), 0);
    let table = restored.workbook.get_table("Sales").unwrap().clone();
    assert_eq!(table.calculated_columns()[2].as_ref().unwrap().formula(), "=(Sales[@Units]*2)");
    restored.set_cell_input(0, "B5", "4").unwrap();
    assert_eq!(restored.workbook.get_cell("Sheet1", "C5"), Value::Number(8.));
    assert_eq!(restored.history.undo_count(), 1);
    restored.history.undo(&mut restored.workbook).unwrap();
    assert_eq!(restored.workbook.get_table("Sales"), Some(&table));
    assert_eq!(restored.workbook.get_cell("Sheet1", "C5"), Value::Null);
    restored.history.redo(&mut restored.workbook).unwrap();
    restored.set_cell_input(0, "C2", "=Sales[@Units]*3").unwrap();
    assert_eq!(restored.workbook.get_cell("Sheet1", "C4"), Value::Number(9.));
    assert_eq!(restored.workbook.get_cell("Sheet1", "C5"), Value::Number(12.));
}

#[test]
fn sheet_commands_preserve_or_invalidate_saved_calculated_column_references() {
    let mut book = workbook_with_inventory_table();
    let rates = book.workbook.add_sheet("Rates");
    book.workbook.set_cell(rates, "A1", Value::Number(3.));
    book.set_cell_input(0, "C3", "=Rates!$A$1*[@Qty]").unwrap();
    book.edit_sheet(Some(rates as u32), "Rates 2026").unwrap();
    assert!(book.workbook.get_table("Inventory").unwrap().calculated_columns()[2]
        .as_ref().unwrap().formula().contains("'Rates 2026'!$A$1"));
    assert!(book.remove_sheet(rates as u32));
    let json = serde_json::to_string(&book.snapshot_persistence_v1_json()).unwrap();
    let mut restored = WasmWorkbook::new();
    restored.restore_persistence_v1_json(serde_json::from_str(&json).unwrap()).unwrap();
    restored.set_cell_input(0, "B5", "4").unwrap();
    assert_eq!(restored.workbook.get_cell("Sheet1", "C5"), Value::Error(ValueError::InvalidRef));
    // 原会话撤销删除恢复源码，之后新增行又能继续依赖恢复的来源。
    book.history.undo(&mut book.workbook).unwrap();
    book.set_cell_input(0, "B5", "4").unwrap();
    assert_eq!(book.workbook.get_cell("Sheet1", "C5"), Value::Number(12.));
}

#[test]
fn structural_commands_preserve_calculated_column_position_and_saved_inheritance() {
    let mut book = workbook_with_inventory_table();
    book.set_cell_input(0, "C3", "=B3*2").unwrap();
    book.edit_structure(0, "insert-columns", 1, 1).unwrap();
    book.edit_structure(0, "delete-rows", 2, 1).unwrap();
    let json = serde_json::to_string(&book.snapshot_persistence_v1_json()).unwrap();
    let mut restored = WasmWorkbook::new();
    restored.restore_persistence_v1_json(serde_json::from_str(&json).unwrap()).unwrap();
    let table = restored.workbook.get_table("Inventory").unwrap();
    assert_eq!(table.calculated_columns().len(), 4);
    assert!(table.calculated_columns()[1].is_none());
    assert!(table.calculated_columns()[3].is_some());
    restored.set_cell_input(0, "C4", "4").unwrap();
    assert_eq!(restored.workbook.get_cell("Sheet1", "D4"), Value::Number(8.));
    restored.history.undo(&mut restored.workbook).unwrap();
    assert_eq!(restored.workbook.get_cell("Sheet1", "D4"), Value::Null);
    restored.history.redo(&mut restored.workbook).unwrap();
    assert_eq!(restored.workbook.get_cell("Sheet1", "D4"), Value::Number(8.));
}

#[test]
fn right_formula_input_expands_and_fills_one_history_entry_then_survives_restore() {
    let mut book = workbook_with_inventory_table();
    book.set_cell_input(0, "D3", "=[@Qty]*2").unwrap();
    assert_eq!(book.history.undo_count(), 1);
    assert_eq!(book.workbook.get_cell("Sheet1", "D2"), Value::Number(2.));
    assert_eq!(book.workbook.get_cell("Sheet1", "D4"), Value::Number(6.));
    assert_eq!(book.tables_json()[0].columns.len(), 4);
    book.history.undo(&mut book.workbook).unwrap();
    assert_eq!(book.tables_json()[0].columns.len(), 3);
    assert_eq!(book.workbook.get_cell("Sheet1", "D1"), Value::Null);
    book.history.redo(&mut book.workbook).unwrap();
    let json = serde_json::to_string(&book.snapshot_persistence_v1_json()).unwrap();
    let mut restored = WasmWorkbook::new();
    restored.restore_persistence_v1_json(serde_json::from_str(&json).unwrap()).unwrap();
    restored.set_cell_input(0, "B5", "4").unwrap();
    assert_eq!(restored.workbook.get_cell("Sheet1", "D5"), Value::Number(8.));
}
