#[test]
fn diagonal_wire_roundtrips_sparse_fields_and_rejects_unrepresentable_input() {
    use serde_json::json;
    let input = json!({"borders": {"diagUp":{"style":"double","color":"#c00000"},
        "diagDown":{"style":"double","color":"#C00000"}, "left":{"style":"thin"}}});
    let wire: CellFormatJSON = serde_json::from_value(input.clone()).unwrap();
    let style = wire.clone().into_style();
    assert_eq!(serde_json::to_value(CellFormatJSON::from_style(&style)).unwrap(), input);
    let format = wire.into_format();
    assert_eq!(format.borders.diag_down.unwrap().style, BorderStyle::Double);
    for invalid in [json!({"style":"unknown"}), json!({"style":"thin","color":"red"}),
        json!({"style":"thin","color":"#123"}), json!({"style":"thin","color":"url(x)"})] {
        assert!(serde_json::from_value::<CellFormatJSON>(json!({"borders":{"diagDown":invalid}})).is_err());
    }
    for down in [json!({"style":"thin","color":"#c00000"}),
        json!({"style":"double","color":"#00ff00"})] {
        let mut invalid = input.clone(); invalid["borders"]["diagDown"] = down;
        assert!(serde_json::from_value::<CellFormatJSON>(invalid).is_err());
    }
    let clear: CellFormatJSON = serde_json::from_value(json!({"borders":null})).unwrap();
    assert_eq!(clear.into_style().borders, Some(CellBorders::default()));
    let absent: CellFormatJSON = serde_json::from_value(json!({})).unwrap();
    assert_eq!(absent.into_style().borders, None);
}
