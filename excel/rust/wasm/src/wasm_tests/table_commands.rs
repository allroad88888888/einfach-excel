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
        serde_json::json!({"kind":"convert-to-range", "name":"Sales", "snapshot":{}}),
        serde_json::json!({"kind":"delete", "name":"Sales"}),
    ] {
        assert!(serde_json::from_value::<TableActionJSON>(json).is_err());
    }
}
