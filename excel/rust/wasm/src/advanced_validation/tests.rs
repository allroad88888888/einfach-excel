#[test]
fn advanced_validation_wire_and_native_file_roundtrip_preserve_anchor_prompt_and_alert() {
    for style in ["stop", "warning", "information"] {
        let json = serde_json::json!({"kind":"custom-formula", "formula":"=B2>0",
            "anchor":{"row":1,"col":1}, "ignoreBlank":false,
            "inputMessage":{"title":"Quantity","message":"请输入正数"},
            "errorAlert":{"style":style,"title":"Check quantity","message":"Positive only"}});
        let wire: DataValidationRuleJSON = serde_json::from_value(json.clone()).unwrap();
        assert_eq!(serde_json::to_value(&wire).unwrap(), json);
        let mut source = WasmWorkbook::new();
        source.history.set_data_validation(&mut source.workbook, 0,
            CellRange::new(CellAddress::new(1, 1), CellAddress::new(2, 1)), Some(wire.into_rule().unwrap())).unwrap();
        let saved = serde_json::to_value(source.snapshot_persistence_v1_json()).unwrap();
        let mut restored = WasmWorkbook::new();
        restored.restore_persistence_v1_json(serde_json::from_value(saved).unwrap()).unwrap();
        assert_eq!(restored.workbook.sheet(0).unwrap().data_validations(), source.workbook.sheet(0).unwrap().data_validations());
        assert_eq!(restored.history.undo_count(), 0);
        let code = match style { "warning" => "DATA_VALIDATION_WARNING", "information" => "DATA_VALIDATION_INFORMATION", _ => "DATA_VALIDATION_FAILED" };
        assert_eq!(restored.workbook.set_cell_input(0, "B3", "-1"), Err(code));
        assert_eq!(restored.workbook.get_cell("Sheet1", "B3"), Value::Null);
    }
}

#[test]
fn advanced_validation_wire_rejects_unknown_recursive_and_bad_message_fields() {
    for json in [
        serde_json::json!({"kind":"custom-formula","formula":"=TRUE","unknown":true}),
        serde_json::json!({"kind":"custom-formula","formula":"=TRUE","anchor":{"row":0,"col":0,"extra":0}}),
        serde_json::json!({"kind":"custom-formula","formula":"=TRUE","errorAlert":{"style":"ignore","title":"","message":""}}),
        serde_json::json!({"kind":"custom-formula","formula":"=TRUE","inputMessage":{"title":"","message":"","script":"x"}}),
        serde_json::json!({"kind":"advanced","kindData":{"kind":"custom-formula","formula":"=TRUE"}}),
    ] { assert!(serde_json::from_value::<DataValidationRuleJSON>(json).is_err()); }
    let legacy: DataValidationRuleJSON = serde_json::from_value(serde_json::json!({"kind":"decimal","min":0,"max":1})).unwrap();
    assert_eq!(legacy.into_rule().unwrap().options, Default::default());
}
