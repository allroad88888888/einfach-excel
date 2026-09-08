#[test]
fn find_wire_preserves_scope_options_and_utf16_match_positions() {
    let request: FindRequestJSON = serde_json::from_value(serde_json::json!({
        "targets": [{"sheet": 2, "rowStart": 0, "colStart": 1, "rowEnd": 999, "colEnd": 3}],
        "query": {"needle": "😀é", "caseSensitive": false, "wholeCell": true, "lookIn": "formulas"},
        "offset": 500, "limit": 500
    }))
    .unwrap();
    let (sheet, range) = request.targets[0].native();
    assert_eq!(sheet, 2);
    assert_eq!(range.end, CellAddress::new(999, 3));
    let query = request.query.native();
    assert_eq!(query.needle, "😀é");
    assert!(query.whole_cell);
    assert_eq!(query.look_in, FindLookIn::Formulas);
    let matched = FindMatchJSON::from(FindMatch {
        sheet: 2,
        address: range.start,
        start: 2,
        end: 5,
    });
    assert_eq!(
        serde_json::to_value(matched).unwrap(),
        serde_json::json!({"sheet": 2, "row": 0, "col": 1, "start": 2, "end": 5})
    );
}

#[test]
fn find_wire_rejects_fractional_coordinates_and_unsupported_search_modes() {
    let base = serde_json::json!({
        "targets": [{"sheet": 0, "rowStart": 0, "colStart": 0, "rowEnd": 999, "colEnd": 3}],
        "query": {"needle": "a", "caseSensitive": false, "wholeCell": false, "lookIn": "values"},
        "offset": 0, "limit": 500
    });
    for invalid in [
        serde_json::json!(-1),
        serde_json::json!(0.5),
        serde_json::json!(4294967296_u64),
    ] {
        let mut request = base.clone();
        request["targets"][0]["rowEnd"] = invalid;
        assert!(serde_json::from_value::<FindRequestJSON>(request).is_err());
    }
    let mut unsupported = base;
    unsupported["query"]["regex"] = serde_json::json!(true);
    assert!(serde_json::from_value::<FindRequestJSON>(unsupported).is_err());
}

#[test]
fn replace_wire_has_no_page_limit_and_distinguishes_current_from_all() {
    let base = serde_json::json!({
        "targets": [{"sheet": 0, "rowStart": 0, "colStart": 0, "rowEnd": 999, "colEnd": 3}],
        "query": {"needle": "old", "caseSensitive": false, "wholeCell": false, "lookIn": "formulas"},
        "replacement": "new"
    });
    let all: ReplaceRequestJSON = serde_json::from_value(base.clone()).unwrap();
    assert!(all.current.is_none());
    let mut current = base.clone();
    current["current"] =
        serde_json::json!({"sheet": 0, "row": 999, "col": 3, "start": 2, "end": 5});
    let current: ReplaceRequestJSON = serde_json::from_value(current).unwrap();
    assert_eq!(current.current.unwrap().start, 2);
    let mut capped = base;
    capped["limit"] = serde_json::json!(500);
    assert!(serde_json::from_value::<ReplaceRequestJSON>(capped).is_err());
}
