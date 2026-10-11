// JSON 只表达语义命令；范围校验、拒绝原子性与撤销由原生历史处理。
#[test]
fn named_range_wire_commands_use_one_native_history_entry_each() {
    let mut book = WasmWorkbook::new();
    book.set_number(0, "A1", 42.0);
    book.set_formula(0, "C1", "=SUM(Sales)");
    for (json, expected) in [
        (
            serde_json::json!({"kind":"create","name":"Sales",
            "target":{"sheet":0,"range":[0,0,0,0]}}),
            Value::Number(42.0),
        ),
        (
            serde_json::json!({"kind":"update","name":"Sales","newName":"NewSales"}),
            Value::Number(42.0),
        ),
        (
            serde_json::json!({"kind":"delete","name":"NewSales"}),
            Value::Error(ValueError::InvalidName),
        ),
    ] {
        let action: NamedRangeActionJSON = serde_json::from_value(json).unwrap();
        assert!(book
            .history
            .change_named_range(&mut book.workbook, 0, action.into_action())
            .unwrap());
        assert_eq!(book.workbook.get_cell("Sheet1", "C1"), expected);
    }
    assert_eq!(book.history.undo_count(), 3);
    book.history.undo(&mut book.workbook).unwrap();
    let names = book.named_ranges_json();
    assert_eq!(names.len(), 1);
    assert_eq!(names[0].name, "NewSales");
    assert_eq!(names[0].target.as_ref().unwrap().range, [0, 0, 0, 0]);
}

#[test]
fn named_range_wire_rejects_extra_fields_and_malformed_targets() {
    for invalid in [
        serde_json::json!({"kind":"create","name":"Sales"}),
        serde_json::json!({"kind":"create","name":"Sales","target":null}),
        serde_json::json!({"kind":"delete","name":"Sales","optimistic":true}),
        serde_json::json!({"kind":"unknown","name":"Sales"}),
        serde_json::json!({"kind":"create","name":"Sales",
            "target":{"sheet":0,"range":[-1,0,0,0]}}),
        serde_json::json!({"kind":"update","name":"Sales","newName":"NewSales",
            "target":{"sheet":0,"range":[0,0,0,0],"value":42}}),
    ] {
        assert!(serde_json::from_value::<NamedRangeActionJSON>(invalid).is_err());
    }
}
