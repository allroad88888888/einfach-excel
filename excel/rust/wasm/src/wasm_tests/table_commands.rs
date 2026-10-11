// 与浏览器共用同一个解码后入口，不绕过原生历史或维护 JS 快照。
#[test]
fn table_wire_commands_create_rename_convert_with_exact_history() {
    let mut book = WasmWorkbook::new();
    book.workbook
        .set_cell(0, "A1", Value::Text("Amount".into()));
    book.workbook.set_cell(0, "A2", Value::Number(10.0));
    book.workbook.set_cell(0, "A3", Value::Number(20.0));
    book.workbook
        .set_formula(0, "C1", "=SUM(Inventory[Amount])");
    for (index, json) in [
        serde_json::json!({"kind":"create", "name":"Inventory", "range":[0,0,2,0]}),
        serde_json::json!({"kind":"rename", "name":"Inventory", "newName":"Sales"}),
        serde_json::json!({"kind":"convert-to-range", "name":"Sales"}),
    ]
    .into_iter()
    .enumerate()
    {
        let action = serde_json::from_value(json).unwrap();
        assert!(book.apply_table_action(0, action).unwrap());
        assert_eq!(book.history.undo_count(), index + 1);
        assert_eq!(book.workbook.get_cell("Sheet1", "C1"), Value::Number(30.0));
    }
    assert!(book.tables_json().is_empty());
    assert!(!book
        .workbook
        .sheet(0)
        .unwrap()
        .get_formula("C1")
        .unwrap()
        .contains("Sales"));
    for _ in 0..2 {
        book.history.undo(&mut book.workbook).unwrap();
        assert_eq!(book.tables_json()[0].name, "Sales");
        book.history.undo(&mut book.workbook).unwrap();
        assert_eq!(book.tables_json()[0].name, "Inventory");
        book.history.undo(&mut book.workbook).unwrap();
        assert!(book.tables_json().is_empty());
        assert_eq!(book.workbook.get_cell("Sheet1", "A3"), Value::Number(20.0));
        for _ in 0..3 {
            book.history.redo(&mut book.workbook).unwrap();
        }
        assert_eq!(book.workbook.get_cell("Sheet1", "C1"), Value::Number(30.0));
    }
}

#[test]
fn table_wire_rejects_invalid_targets_without_mutation_or_lost_redo() {
    let mut book = WasmWorkbook::new();
    book.workbook.add_sheet("Other");
    let create = || {
        serde_json::from_value(serde_json::json!({
            "kind":"create", "range":[0,0,2,0]
        }))
        .unwrap()
    };
    book.apply_table_action(0, create()).unwrap();
    let name = book.tables_json()[0].name.clone();
    assert!(!book
        .apply_table_action(
            0,
            TableActionJSON::Rename {
                name: name.clone(),
                new_name: name.clone(),
            }
        )
        .unwrap());
    for kind in ["rename", "convert-to-range"] {
        let mut json = serde_json::json!({"kind":kind,"name":name});
        if kind == "rename" {
            json["newName"] = "OtherTable".into();
        }
        assert!(book
            .apply_table_action(1, serde_json::from_value(json).unwrap())
            .is_err());
    }
    assert_eq!(book.history.undo_count(), 1);
    assert_eq!(book.tables_json()[0].name, name);
    book.history.undo(&mut book.workbook).unwrap();
    assert!(book.apply_table_action(99, create()).is_err());
    assert_eq!(book.history.redo_count(), 1);
    assert!(book.tables_json().is_empty());
    book.history.redo(&mut book.workbook).unwrap();
    assert_eq!(book.tables_json()[0].name, name);
}

#[test]
fn table_wire_rejects_malformed_actions_and_host_owned_history_fields() {
    for json in [
        serde_json::json!({"kind":"create"}),
        serde_json::json!({"kind":"create", "range":[-1,0,2,0]}),
        serde_json::json!({"kind":"create", "range":[0,0,2]}),
        serde_json::json!({"kind":"rename", "name":"Sales"}),
        serde_json::json!({"kind":"resize", "name":"Sales", "range":[0,0,2]}),
        serde_json::json!({"kind":"rename-column", "name":"Sales", "column":"Amount"}),
        serde_json::json!({"kind":"convert-to-range", "name":"Sales", "snapshot":{}}),
        serde_json::json!({"kind":"delete", "name":"Sales"}),
    ] {
        assert!(serde_json::from_value::<TableActionJSON>(json).is_err());
    }
}

#[test]
fn column_command_and_direct_input_share_native_history_and_projection() {
    let mut book = WasmWorkbook::new();
    book.workbook.set_cell(0, "A1", Value::Text("Amount".into()));
    book.workbook.set_cell(0, "A2", Value::Number(10.0));
    book.workbook.set_cell(0, "A3", Value::Number(20.0));
    book.workbook.set_formula(0, "C1", "=SUM(Inventory[Amount])");
    book.apply_table_action(0, serde_json::from_value(serde_json::json!({
        "kind":"create", "name":"Inventory", "range":[0,0,2,0]
    })).unwrap()).unwrap();
    assert!(book.apply_table_action(0, serde_json::from_value(serde_json::json!({
        "kind":"rename-column", "name":"Inventory", "column":"Amount", "newName":"Revenue"
    })).unwrap()).unwrap());
    assert_eq!(book.history.undo_count(), 2);
    assert_eq!(book.tables_json()[0].columns, ["Revenue"]);
    assert_eq!(book.workbook.get_cell("Sheet1", "A1"), Value::Text("Revenue".into()));
    // 直接调用浏览器绑定，不能绕过历史改用 workbook.set_cell_input。
    book.set_cell_input(0, "A1", "Net [tax]").unwrap();
    assert_eq!(book.history.undo_count(), 3);
    assert_eq!(book.tables_json()[0].columns, ["Net [tax]"]);
    assert_eq!(book.workbook.get_cell("Sheet1", "C1"), Value::Number(30.0));
    for _ in 0..2 {
        book.history.undo(&mut book.workbook).unwrap();
        assert_eq!(book.tables_json()[0].columns, ["Revenue"]);
        book.history.undo(&mut book.workbook).unwrap();
        assert_eq!(book.tables_json()[0].columns, ["Amount"]);
        assert_eq!(book.workbook.sheet(0).unwrap().get_formula("C1").as_deref(),
            Some("=SUM(Inventory[Amount])"));
        book.history.redo(&mut book.workbook).unwrap();
        book.history.redo(&mut book.workbook).unwrap();
        assert_eq!(book.workbook.get_cell("Sheet1", "C1"), Value::Number(30.0));
    }
    book.set_cell_input(0, "A2", "40").unwrap();
    assert_eq!(book.history.undo_count(), 4);
    assert_eq!(book.workbook.get_cell("Sheet1", "C1"), Value::Number(60.0));
    book.history.undo(&mut book.workbook).unwrap();
    assert_eq!(book.workbook.get_cell("Sheet1", "C1"), Value::Number(30.0));
}

#[test]
fn column_wire_rejection_and_noop_leave_redo_intact() {
    let mut book = WasmWorkbook::new();
    book.workbook.add_sheet("Other");
    book.apply_table_action(0, serde_json::from_value(serde_json::json!({
        "kind":"create", "name":"Inventory", "range":[0,0,2,1]
    })).unwrap()).unwrap();
    book.set_cell_input(0, "D1", "42").unwrap();
    book.history.undo(&mut book.workbook).unwrap();
    for (sheet, column, new_name) in [(1, "Column1", "Net"), (99, "Column1", "Net"),
        (0, "missing", "Net"), (0, "Column1", "Column2"), (0, "Column1", " ")] {
        assert!(book.apply_table_action(sheet, serde_json::from_value(serde_json::json!({
            "kind":"rename-column", "name":"Inventory", "column":column, "newName":new_name
        })).unwrap()).is_err());
        assert_eq!(book.history.redo_count(), 1);
        assert_eq!(book.tables_json()[0].columns, ["Column1", "Column2"]);
    }
    assert!(!book.apply_table_action(0, serde_json::from_value(serde_json::json!({
        "kind":"rename-column", "name":"Inventory", "column":"Column1", "newName":"Column1"
    })).unwrap()).unwrap());
    assert_eq!(book.history.redo_count(), 1);
}

#[test]
fn resize_wire_returns_native_range_and_rejects_foreign_sheets_without_losing_redo() {
    let mut book = WasmWorkbook::new();
    book.workbook.set_cell(0, "A1", Value::Text("Amount".into()));
    book.workbook.set_cell(0, "A2", Value::Number(10.));
    book.workbook.set_cell(0, "A3", Value::Number(20.));
    book.workbook.set_formula(0, "D1", "=SUM(Inventory[Amount])");
    book.apply_table_action(0, serde_json::from_value(serde_json::json!({
        "kind":"create", "name":"Inventory", "range":[0,0,1,0]
    })).unwrap()).unwrap();
    let action = || serde_json::from_value(serde_json::json!({
        "kind":"resize", "name":"Inventory", "range":[0,0,2,1]
    })).unwrap();
    assert!(book.apply_table_action(0, action()).unwrap());
    assert_eq!(book.tables_json()[0].range, "A1:B3");
    assert_eq!(book.tables_json()[0].columns, ["Amount", "Column1"]);
    assert_eq!(book.workbook.get_cell("Sheet1", "D1"), Value::Number(30.));
    assert_eq!(book.history.undo_count(), 2);
    assert!(!book.apply_table_action(0, action()).unwrap());
    book.history.undo(&mut book.workbook).unwrap();
    assert_eq!(book.tables_json()[0].range, "A1:A2");
    assert_eq!(book.workbook.get_cell("Sheet1", "D1"), Value::Number(10.));
    book.workbook.add_sheet("Other");
    assert!(book.apply_table_action(1, action()).is_err());
    assert_eq!(book.history.redo_count(), 1);
    book.history.redo(&mut book.workbook).unwrap();
    assert_eq!(book.tables_json()[0].range, "A1:B3");
}
