#[test]
fn pattern_wire_preserves_absence_null_and_descriptor_in_all_directions() {
    use serde_json::json;
    let fill = json!({"kind":"pattern","pattern":"lightDown","foreground":"#AB1234"});
    for input in [json!({}), json!({"fill":null}), json!({"fill":fill,"bgColor":"#fff2cc"})] {
        let wire: CellFormatJSON = serde_json::from_value(input.clone()).unwrap();
        let style = wire.clone().into_style();
        assert_eq!(serde_json::to_value(CellFormatJSON::from_style(&style)).unwrap(), input);
        let format = wire.into_format();
        let full = serde_json::to_value(CellFormatJSON::from_format(&format)).unwrap();
        if input["fill"].is_null() { assert!(full.get("fill").is_none()); }
        else { assert_eq!(full["fill"], fill); }
    }
    for invalid in [json!({"kind":"pattern","pattern":"invalid","foreground":"#123456"}),
        json!({"kind":"pattern","pattern":"gray125","foreground":"#123"}),
        json!({"kind":"pattern","pattern":"lightUp","foreground":"url(x)"}),
        json!({"kind":"pattern","pattern":"lightUp","foreground":"#123456","background":"#ffffff"})] {
        assert!(serde_json::from_value::<CellFormatJSON>(json!({"fill":invalid})).is_err());
    }
}
