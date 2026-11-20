#[test]
fn shrink_wire_preserves_sparse_false_dual_flags_and_nominal_font_size() {
    for value in [true, false] {
        let wire: CellFormatJSON = serde_json::from_value(serde_json::json!({
            "shrinkToFit": value, "wrap": true, "fontSize": 24
        })).unwrap();
        let style = wire.clone().into_style();
        let encoded = serde_json::to_value(CellFormatJSON::from_style(&style)).unwrap();
        assert_eq!(encoded["shrinkToFit"], value);
        assert_eq!(encoded["wrap"], true);
        assert_eq!(encoded["fontSize"], 24);
        let format = wire.into_format();
        assert_eq!(format.shrink_to_fit, value);
        assert!(format.wrap_text);
        assert_eq!(format.font_size, Some(24));
    }
    let missing: CellFormatJSON = serde_json::from_value(serde_json::json!({})).unwrap();
    assert_eq!(missing.into_style().shrink_to_fit, None);
    assert!(!serde_json::to_value(CellFormatJSON::from_format(&CellFormat::default())).unwrap()
        .as_object().unwrap().contains_key("shrinkToFit"));
    for value in [serde_json::json!("true"), serde_json::json!(1), serde_json::json!({})] {
        assert!(serde_json::from_value::<CellFormatJSON>(serde_json::json!({"shrinkToFit":value})).is_err());
    }
}

#[test]
fn shrink_format_snapshot_roundtrips_all_sparse_style_scopes() {
    let mut book = Workbook::new();
    let sheet = book.sheet_mut(0).unwrap();
    let range = CellRange::single(CellAddress::new(1, 0));
    for (scope, value) in [(StyleScope::Column, true), (StyleScope::Row, true), (StyleScope::Cell, false)] {
        sheet.patch_format_range(range, scope, CellStyle { shrink_to_fit: Some(value), ..Default::default() });
    }
    let original = sheet.snapshot_format_range(range);
    let encoded = serde_json::to_value(FormatRangeSnapshotJSON::from_snapshot(&original, Some(0))).unwrap();
    let wire: FormatRangeSnapshotJSON = serde_json::from_value(encoded).unwrap();
    let restored = wire.into_snapshot().unwrap();
    assert_eq!(restored.cell_styles, original.cell_styles);
    assert_eq!(restored.row_styles, original.row_styles);
    assert_eq!(restored.column_styles, original.column_styles);
}
