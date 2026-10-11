#[test]
fn totals_commands_and_projection_use_native_history_without_persisted_function_copies() {
    let mut book = WasmWorkbook::new();
    book.workbook
        .set_cell(0, "A1", Value::Text("Amount".into()));
    book.workbook.set_cell(0, "A2", Value::Number(10.0));
    book.workbook.set_cell(0, "A3", Value::Number(20.0));
    book.apply_table_action(
        0,
        serde_json::from_value(serde_json::json!({
            "kind":"create", "name":"Inventory", "range":[0,0,2,0]
        }))
        .unwrap(),
    )
    .unwrap();
    for (json, expected) in [
        (
            serde_json::json!({"kind":"totals-row","name":"Inventory","enabled":true,"rowCount":10}),
            Value::Number(30.0),
        ),
        (
            serde_json::json!({"kind":"total-function","name":"Inventory","column":"Amount","function":"average"}),
            Value::Number(15.0),
        ),
        (
            serde_json::json!({"kind":"totals-row","name":"Inventory","enabled":false,"rowCount":10}),
            Value::Null,
        ),
    ] {
        assert!(book
            .apply_table_action(0, serde_json::from_value(json).unwrap())
            .unwrap());
        assert_eq!(book.workbook.get_cell("Sheet1", "A4"), expected);
    }
    assert_eq!(book.history.undo_count(), 4);
    book.history.undo(&mut book.workbook).unwrap();
    let view = serde_json::to_value(book.table_projection_json().unwrap()).unwrap();
    assert_eq!(view[0]["totalFunctions"], serde_json::json!(["average"]));
    assert_eq!(view[0]["hasTotals"], true);
    let stored = serde_json::to_value(book.tables_json()).unwrap();
    assert!(stored[0].get("totalFunctions").is_none());
    book.workbook
        .set_cell(0, "A4", Value::Text("Custom".into()));
    let view = serde_json::to_value(book.table_projection_json().unwrap()).unwrap();
    assert_eq!(view[0]["totalFunctions"], serde_json::json!([null]));
}

#[test]
fn totals_commands_reject_wrong_sheet_canvas_and_unknown_functions_before_mutation() {
    let mut book = WasmWorkbook::new();
    book.workbook.add_sheet("Other");
    book.apply_table_action(
        0,
        serde_json::from_value(serde_json::json!({
            "kind":"create", "name":"Inventory", "range":[0,0,2,0]
        }))
        .unwrap(),
    )
    .unwrap();
    for (sheet, json) in [
        (
            0,
            serde_json::json!({"kind":"totals-row","name":"Inventory","enabled":true,"rowCount":3}),
        ),
        (
            1,
            serde_json::json!({"kind":"totals-row","name":"Inventory","enabled":true,"rowCount":10}),
        ),
        (
            0,
            serde_json::json!({"kind":"total-function","name":"Inventory","column":"Column1","function":"invalid"}),
        ),
    ] {
        assert!(book
            .apply_table_action(sheet, serde_json::from_value(json).unwrap())
            .is_err());
        assert_eq!(book.history.undo_count(), 1);
        assert!(!book.workbook.get_table("Inventory").unwrap().has_totals());
    }
}
