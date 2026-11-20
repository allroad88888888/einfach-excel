#[test]
fn accounting_wire_preview_and_persistence_share_rich_display() {
    let mut source = WasmWorkbook::new();
    source.workbook.set_cell_input(0, "A1", "=-1234.5").unwrap();
    for (scope, range) in [(StyleScope::Column, "A1:A3"), (StyleScope::Row, "A2:B2"),
        (StyleScope::Cell, "A3")] {
        source.workbook.sheet_mut(0).unwrap().patch_format_range(
            CellRange::new(CellAddress::parse(range.split(':').next().unwrap()).unwrap(),
                CellAddress::parse(range.split(':').last().unwrap()).unwrap()), scope,
            CellStyle { number_format: Some(NumberFormat::Accounting { symbol: "€".into(), digits: 3 }),
                ..Default::default() });
    }
    let wire = serde_json::json!({"kind":"accounting","symbol":"€","digits":3});
    let native = serde_json::from_value::<NumberFormatJSON>(wire.clone()).unwrap().into_number_format();
    let encoded = serde_json::to_value(NumberFormatJSON::from_number_format(&native)).unwrap();
    for (key, value) in wire.as_object().unwrap() { assert_eq!(&encoded[key], value); }
    let before = serde_json::to_value(source.snapshot_persistence_v1_json()).unwrap();
    let preview = source.number_format_preview(0, "A1", serde_json::from_value(wire).unwrap()).unwrap();
    let grid = native_number_display(&source.workbook, 0, "A1", &Value::Number(-1234.5)).unwrap();
    assert_eq!(preview.text.as_deref(), Some(" €(1,234.500)"));
    assert_eq!(preview.fill, grid.fill);
    assert_eq!(preview.pads, grid.pads);
    assert_eq!(serde_json::to_value(source.snapshot_persistence_v1_json()).unwrap(), before);
    let mut restored = WasmWorkbook::new();
    restored.restore_persistence_v1_json(serde_json::from_value(before).unwrap()).unwrap();
    for addr in ["A1", "B2", "A3"] {
        assert_eq!(restored.workbook.sheet(0).unwrap().get_format(addr).number_format, native);
    }
    assert_eq!(restored.get_formula(0, "A1"), "=-1234.5");
    assert_eq!(native_number_display(&restored.workbook, 0, "A1", &Value::Number(-1234.5)), Some(grid));
}
