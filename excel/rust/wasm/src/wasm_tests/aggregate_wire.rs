#[test]
fn aggregate_wire_rejects_invalid_coordinate_types() {
    let base =
        serde_json::json!({ "sheet": 0, "rowStart": 0, "colStart": 0, "rowEnd": 999, "colEnd": 7 });
    for invalid in [
        serde_json::json!(-1),
        serde_json::json!(0.5),
        serde_json::json!(4294967296_u64),
    ] {
        let mut input = base.clone();
        input["rowEnd"] = invalid;
        assert!(serde_json::from_value::<AggregateTargetJSON>(input).is_err());
    }
    let mut input = base;
    input["visibleOnly"] = serde_json::json!(true);
    assert!(serde_json::from_value::<AggregateTargetJSON>(input).is_err());
}

#[test]
fn aggregate_wire_uses_camel_case_and_explicit_absent_values() {
    assert_eq!(
        serde_json::to_value(SelectionNumbersJSON {
            count: 0,
            numeric_count: 0,
            sum: None,
            average: None,
            min: None,
            max: None,
        })
        .unwrap(),
        serde_json::json!({ "count": 0, "numericCount": 0, "sum": null, "average": null, "min": null, "max": null })
    );
}
