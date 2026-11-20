#[test]
fn sort_colors_wire_requires_explicit_target_and_rejects_mixed_fields() {
    let decode = |value| serde_json::from_value::<SortCriterionWireJSON>(value);
    for invalid in [
        serde_json::json!({"col":0,"sortOn":"font-color","position":"top"}),
        serde_json::json!({"col":0,"sortOn":"unknown","color":null,"position":"top"}),
        serde_json::json!({"col":0,"sortOn":"cell-color","color":null,"position":"first"}),
        serde_json::json!({"col":0,"sortOn":"cell-color","color":null,"position":"top","direction":"asc"}),
    ] {
        assert!(decode(invalid).is_err());
    }
    assert!(decode(serde_json::json!({"col":0,"sortOn":"font-color","color":"#xyz123","position":"top"}))
        .unwrap().into_criterion().is_err());
    for (kind, source, color) in [
        ("font-color", SortColorSource::Font, Some("#123abc")),
        ("cell-color", SortColorSource::Fill, None),
    ] {
        let key = decode(serde_json::json!({"col":1,"sortOn":kind,"color":color,"position":"bottom"}))
            .unwrap().into_criterion().unwrap();
        assert_eq!(key, SortCriterion::Color(SortColorKey::new(
            1, source, color, SortColorPosition::Bottom,
        ).unwrap()));
    }
}
