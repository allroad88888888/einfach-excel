// 不依赖 JS 模拟校验；序列化后必须仍由恢复出来的 Rust 规则拒绝非法输入。
#[test]
fn validation_roundtrip_preserves_all_six_rules_and_existing_invalid_values() {
    let mut book = WasmWorkbook::new();
    for (col, json) in [
        serde_json::json!({"kind":"whole-number", "min":1, "max":10}),
        serde_json::json!({"kind":"decimal", "min":0, "max":1, "ignoreBlank":false}),
        serde_json::json!({"kind":"list", "items":["Paid", "Pending"]}),
        serde_json::json!({"kind":"date", "min":"2026-10-01", "max":"2026-10-31"}),
        serde_json::json!({"kind":"time", "min":"09:00", "max":"17:00"}),
        serde_json::json!({"kind":"text-length", "min":2, "max":4, "ignoreBlank":false}),
    ]
    .into_iter()
    .enumerate()
    {
        let rule: DataValidationRuleJSON = serde_json::from_value(json).unwrap();
        book.history
            .set_data_validation(
                &mut book.workbook,
                0,
                CellRange::single(CellAddress::new(0, col as u32)),
                Some(rule.into_rule().unwrap()),
            )
            .unwrap();
    }
    // 规则可以应用于已有非法值；恢复不应误用交互输入路径拒绝整份文档。
    book.set_number(0, "A1", 99.0);
    let json = serde_json::to_value(book.snapshot_persistence_v1_json()).unwrap();
    assert_eq!(
        json["dataValidations"][0]["regions"]
            .as_array()
            .unwrap()
            .len(),
        6
    );
    let mut restored = WasmWorkbook::new();
    restored
        .restore_persistence_v1_json(serde_json::from_value(json).unwrap())
        .unwrap();
    assert_eq!(
        restored.workbook.sheet(0).unwrap().data_validations(),
        book.workbook.sheet(0).unwrap().data_validations()
    );
    assert_eq!(
        restored.workbook.get_cell("Sheet1", "A1"),
        Value::Number(99.0)
    );
    assert_eq!(restored.history.undo_count(), 0);
    for (addr, valid, invalid) in [("A1", "5", "5.5"), ("B1", "0.25", ""), ("C1", "Paid", "No"),
        ("D1", "2026-10-11", "2026-11-01"), ("E1", "12:00", "18:00"), ("F1", "中文🙂", "x")] {
        restored.workbook.set_cell_input(0, addr, valid).unwrap();
        assert_eq!(
            restored.workbook.set_cell_input(0, addr, invalid),
            Err("DATA_VALIDATION_FAILED")
        );
    }
}

#[test]
fn date_time_length_wire_rejects_bad_types_bounds_and_fractional_lengths() {
    for bad in [
        serde_json::json!({"kind":"date", "min":1, "max":10}),
        serde_json::json!({"kind":"time", "min":0.0, "max":0.5}),
        serde_json::json!({"kind":"text-length", "min":"2", "max":4}),
    ] {
        assert!(serde_json::from_value::<DataValidationRuleJSON>(bad).is_err());
    }
    for bad in [
        serde_json::json!({"kind":"date", "min":"2026-02-29", "max":"2026-03-01"}),
        serde_json::json!({"kind":"time", "min":"00:00", "max":"24:00"}),
        serde_json::json!({"kind":"text-length", "min":0.5, "max":4}),
    ] {
        assert!(serde_json::from_value::<DataValidationRuleJSON>(bad).unwrap().into_rule().is_err());
    }
}

#[test]
fn comparison_operators_roundtrip_through_native_history_and_persistence() {
    for operator in ["between", "not-between", "equal", "not-equal", "greater-than",
        "greater-than-or-equal", "less-than", "less-than-or-equal"] {
        let mut source = WasmWorkbook::new();
        let json = serde_json::json!({"kind":"decimal", "min":2, "max":4,
            "operator":operator, "ignoreBlank":false});
        let rule = serde_json::from_value::<DataValidationRuleJSON>(json).unwrap().into_rule().unwrap();
        source.history.set_data_validation(&mut source.workbook, 0,
            CellRange::single(CellAddress::new(0, 0)), Some(rule.clone())).unwrap();
        let snapshot = serde_json::to_value(source.snapshot_persistence_v1_json()).unwrap();
        let saved = &snapshot["dataValidations"][0]["regions"][0]["rule"];
        if operator == "between" { assert!(saved.get("operator").is_none()); }
        else { assert_eq!(saved["operator"], operator); }
        let mut restored = WasmWorkbook::new();
        restored.restore_persistence_v1_json(serde_json::from_value(snapshot).unwrap()).unwrap();
        assert_eq!(restored.workbook.sheet(0).unwrap().data_validation_at(CellAddress::new(0, 0)), Some(&rule));
        for value in [1.0, 2.0, 3.0, 4.0, 5.0] {
            assert_eq!(restored.workbook.set_cell_input(0, "A1", &value.to_string()).is_ok(),
                rule.accepts(&Value::Number(value)), "{operator} / {value}");
        }
    }
    for json in [
        serde_json::json!({"kind":"decimal", "min":0, "max":1, "operator":"approximately"}),
        serde_json::json!({"kind":"list", "items":["a"], "operator":"equal"}),
    ] { assert!(serde_json::from_value::<DataValidationRuleJSON>(json).is_err()); }
}

#[test]
fn invalid_validation_snapshot_keeps_current_workbook_and_history() {
    let mut book = WasmWorkbook::new();
    book.set_number(0, "A1", 7.0);
    book.history
        .set_data_validation(
            &mut book.workbook,
            0,
            CellRange::single(CellAddress::new(0, 0)),
            Some(DataValidationRule {
                kind: DataValidationKind::WholeNumber {
                    min: 1.0,
                    max: 10.0,
                },
                ignore_blank: true,
                operator: Default::default(),
                options: Default::default(),
            }),
        )
        .unwrap();
    let before = serde_json::to_value(book.snapshot_persistence_v1_json()).unwrap();
    let entry = serde_json::json!({"range":[0,0,0,0], "rule":{"kind":"decimal", "min":0, "max":1}});
    for entries in [
        serde_json::json!([{"sheet":99, "regions":[entry.clone()]}]),
        serde_json::json!([{"sheet":0, "regions":[entry.clone()]}, {"sheet":0, "regions":[]}]),
        serde_json::json!([{"sheet":0, "regions":[entry.clone(), entry.clone()]}]),
        serde_json::json!([{"sheet":0, "regions":[{"range":[2,0,0,0], "rule":entry["rule"].clone()}]}]),
        serde_json::json!([{"sheet":0, "regions":[{"range":[0,0,1048576,0], "rule":entry["rule"].clone()}]}]),
        serde_json::json!([{"sheet":0, "regions":[{"range":[0,0,0,0], "rule":{"kind":"decimal", "min":3, "max":1}}]}]),
    ] {
        let mut invalid = before.clone();
        invalid["dataValidations"] = entries;
        assert!(book
            .restore_persistence_v1_json(serde_json::from_value(invalid).unwrap())
            .is_err());
        assert_eq!(
            serde_json::to_value(book.snapshot_persistence_v1_json()).unwrap(),
            before
        );
        assert_eq!(book.history.undo_count(), 1);
    }
}

#[test]
fn legacy_validation_defaults_and_strict_wire_shape() {
    let mut book = WasmWorkbook::new();
    let legacy = book.snapshot_persistence_v1_json();
    let json = serde_json::to_value(&legacy).unwrap();
    assert!(json.get("dataValidations").is_none());
    book.restore_persistence_v1_json(serde_json::from_value(json).unwrap())
        .unwrap();
    assert!(book
        .workbook
        .sheet(0)
        .unwrap()
        .data_validations()
        .is_empty());
    for bad in [
        serde_json::json!({"kind":"decimal", "min":0, "max":1, "height":20}),
        serde_json::json!({"kind":"list", "items":["a"], "min":0}),
        serde_json::json!({"kind":"whole-number", "min":0}),
        serde_json::json!({"kind":"regex", "pattern":".*"}),
    ] {
        assert!(serde_json::from_value::<DataValidationRuleJSON>(bad).is_err());
    }
}
