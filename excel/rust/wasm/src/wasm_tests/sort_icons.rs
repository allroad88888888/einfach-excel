#[test]
fn sort_icon_wire_captures_displayed_identity_and_explicit_absence() {
    let decode = |value| serde_json::from_value::<SortCriterionWireJSON>(value);
    let icon = decode(serde_json::json!({
        "col":0,"sortOn":"icon","icon":{"set":"three-flags","index":2},"position":"top"
    })).unwrap().into_criterion().unwrap();
    assert_eq!(icon, SortCriterion::Icon(SortIconKey::new(
        0, Some((IconSet::Flags, 2)), SortColorPosition::Top,
    ).unwrap()));
    let absent = decode(serde_json::json!({
        "col":0,"sortOn":"icon","icon":null,"position":"bottom"
    })).unwrap().into_criterion().unwrap();
    assert_eq!(absent, SortCriterion::Icon(SortIconKey::new(
        0, None, SortColorPosition::Bottom,
    ).unwrap()));
    for invalid in [
        serde_json::json!({"col":0,"sortOn":"icon","position":"top"}),
        serde_json::json!({"col":0,"sortOn":"icon","icon":{"set":"arrows","index":0},"position":"top"}),
        serde_json::json!({"col":0,"sortOn":"icon","icon":{"set":"three-arrows","index":1.5},"position":"top"}),
        serde_json::json!({"col":0,"sortOn":"icon","icon":null,"position":"top","direction":"asc"}),
    ] {
        assert!(decode(invalid).is_err());
    }
    assert!(decode(serde_json::json!({
        "col":0,"sortOn":"icon","icon":{"set":"three-arrows","index":3},"position":"top"
    })).unwrap().into_criterion().is_err());
}
