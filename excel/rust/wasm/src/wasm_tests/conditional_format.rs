#[test]
fn wasm_conditional_format_persists_revision_and_rules() {
    let mut source = WasmWorkbook::new();
    let request = SetConditionalFormatRuleJSON {
        revision: 0,
        rule_id: Some("high-value".to_string()),
        scope: ConditionalFormatScopeJSON {
            range: ConditionalFormatRangeJSON {
                row_start: 1,
                row_end: 3,
                col_start: 2,
                col_end: 4,
            },
        },
        priority: Some(3),
        rule: serde_json::json!({
            "kind": "cell-value",
            "operator": "greater-than",
            "value": 100,
        }),
    };
    let rule = request.into_entry("high-value".to_string()).unwrap();
    source
        .workbook
        .set_conditional_format_rule(0, 0, rule)
        .unwrap();

    let envelope = source.snapshot_persistence_v1_json();
    assert_eq!(envelope.conditional_formats.len(), 1);
    assert_eq!(envelope.conditional_formats[0].revision, 1);

    let mut restored = WasmWorkbook::new();
    let stats = restored.restore_persistence_v1_json(envelope).unwrap();
    assert_eq!(stats.restored_conditional_formats, 1);
    let config = restored.workbook.conditional_format_config(0).unwrap();
    assert_eq!(config.revision, 1);
    assert_eq!(config.rules[0].id, "high-value");
}

#[test]
fn legacy_persistence_without_conditional_formats_restores_defaults() {
    let payload: WorkbookPersistenceV1JSON =
        serde_json::from_str(r#"{"version":1,"sheets":[{"idx":0,"name":"Sheet1"}],"cells":[]}"#)
            .unwrap();
    let mut restored = WasmWorkbook::new();
    let stats = restored.restore_persistence_v1_json(payload).unwrap();
    assert_eq!(stats.restored_conditional_formats, 0);
    assert_eq!(
        restored
            .workbook
            .conditional_format_config(0)
            .unwrap()
            .revision,
        0
    );
}

#[test]
fn numeric_rules_persist_without_baking_their_highlight_into_cell_styles() {
    let mut source = WasmWorkbook::new();
    source.workbook.set_cell(0, "A1", Value::Number(9.0));
    let request: SetConditionalFormatRuleJSON = serde_json::from_value(serde_json::json!({
        "revision": 0, "scope": { "range": { "rowStart": 0, "rowEnd": 1, "colStart": 0, "colEnd": 0 } },
        "rule": { "kind": "cell-value", "operator": "gt", "value": "5", "format": { "bgColor": "#FFC7CE" } },
    })).unwrap();
    let rule = request.into_entry("numeric".into()).unwrap();
    source.history.set_conditional_format_rule(&mut source.workbook, 0, 0, rule).unwrap();
    let payload = source.snapshot_persistence_v1_json();
    let mut restored = WasmWorkbook::new();
    restored.restore_persistence_v1_json(payload).unwrap();
    let range = CellRange::single(CellAddress::new(0, 0));
    assert!(restored.workbook.sheet(0).unwrap().snapshot_format_range(range).cell_styles.is_empty());
    let visible = restored.workbook.snapshot_display_format_range(0, range).unwrap();
    assert_eq!(visible.cell_styles[0].1.background, Some(Some("#FFC7CE".into())));
    restored.workbook.set_cell(0, "A1", Value::Number(1.0));
    assert!(restored.workbook.snapshot_display_format_range(0, range).unwrap().cell_styles.is_empty());
}

#[test]
fn conditional_format_command_wire_rejects_extra_mutation_fields() {
    assert!(serde_json::from_value::<RemoveConditionalFormatRuleJSON>(serde_json::json!({
        "revision": 0, "ruleId": "r", "clearCells": true,
    })).is_err());
    assert!(serde_json::from_value::<SetConditionalFormatRuleJSON>(serde_json::json!({
        "revision": 0, "scope": { "range": { "rowStart": 0, "rowEnd": 0, "colStart": 0, "colEnd": 0 } },
        "rule": {}, "overwrite": true,
    })).is_err());
}
