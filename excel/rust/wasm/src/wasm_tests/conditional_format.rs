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
