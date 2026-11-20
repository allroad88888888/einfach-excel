#[test]
fn horizontal_sort_wire_rejects_columns_and_vertical_positions() {
    let parse = |input| serde_json::from_value::<SortCriterionWireJSON>(input).unwrap();
    assert!(parse(serde_json::json!({ "row": 1, "direction": "desc" })).into_row_criterion().is_ok());
    assert!(parse(serde_json::json!({ "col": 1, "direction": "desc" })).into_row_criterion().is_err());
    assert!(parse(serde_json::json!({ "row": 1, "col": 2, "direction": "asc" })).into_row_criterion().is_err());
    assert!(parse(serde_json::json!({ "row": 1, "direction": "bad" })).into_row_criterion().is_err());
    assert!(parse(serde_json::json!({ "row": 1, "sortOn": "cell-color",
        "color": "#ffffff", "position": "left" })).into_row_criterion().is_ok());
    assert!(parse(serde_json::json!({ "row": 1, "sortOn": "cell-color",
        "color": "#ffffff", "position": "top" })).into_row_criterion().is_err());
    assert!(parse(serde_json::json!({ "row": 1, "sortOn": "icon", "icon": null,
        "position": "right" })).into_row_criterion().is_ok());
    assert!(parse(serde_json::json!({ "col": 1, "sortOn": "icon", "icon": null,
        "position": "right" })).into_criterion().is_err());
}

#[test]
fn horizontal_sort_report_exposes_a_separate_column_witness() {
    let column = ColumnSortReport {
        moved_columns: 2, moved_cells: 4, column_permutation: vec![(1, 3), (3, 1)],
    };
    let report = serde_json::to_value(SortRangeReportJSON::from_columns(&column)).unwrap();
    assert_eq!(report, serde_json::json!({ "ok": true, "movedRows": 0, "movedCells": 4,
        "rowPermutation": [], "movedColumns": 2, "columnPermutation": [[1, 3], [3, 1]] }));
    let row = serde_json::to_value(SortRangeReportJSON::from_report(&SortRangeReport::default())).unwrap();
    assert!(row.get("movedColumns").is_none());
    assert!(row.get("columnPermutation").is_none());
}
