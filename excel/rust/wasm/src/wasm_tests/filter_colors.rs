#[test]
fn color_filter_target_roundtrips_and_requires_exact_rgb_or_automatic() {
    for (source, color) in [("fill", "automatic"), ("font", "#c00001")] {
        let rule = serde_json::json!({ "kind": "color", "colIndex": 1, "source": source, "color": color });
        let native = serde_json::from_value::<ColumnFilterRuleJSON>(rule.clone()).unwrap().into_rule();
        assert_eq!(serde_json::to_value(ColumnFilterRuleJSON::from_rule(&native)).unwrap(), rule);
    }
    for color in [serde_json::json!(""), serde_json::json!("#f00"), serde_json::json!("red"),
        serde_json::json!(null), serde_json::json!("#abcdef80"), serde_json::json!(8)] {
        let rule = serde_json::json!({ "kind": "color", "colIndex": 1, "source": "fill", "color": color });
        assert!(serde_json::from_value::<ColumnFilterRuleJSON>(rule).is_err());
    }
    assert!(serde_json::from_value::<ColumnFilterRuleJSON>(
        serde_json::json!({ "kind": "color", "colIndex": 1, "source": "fill" })).is_err());
    assert!(serde_json::from_value::<ColumnFilterRuleJSON>(
        serde_json::json!({ "kind": "color", "colIndex": 1, "source": "stroke", "color": "automatic" })).is_err());
}
