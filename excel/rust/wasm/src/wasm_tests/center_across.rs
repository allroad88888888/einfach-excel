// "centerAcross" 是 Excel centerContinuous：线协议字符串往返，快照持久化后保持，旧值不受影响。
#[test]
fn center_across_wire_value_roundtrips_through_format_and_persistence() {
    let json: CellFormatJSON = serde_json::from_str(r#"{"align":"centerAcross"}"#).unwrap();
    assert_eq!(json.clone().into_format().align, Align::CenterAcross);
    assert_eq!(
        CellFormatJSON::from_format(&json.clone().into_format()).align.as_deref(),
        Some("centerAcross")
    );
    assert_eq!(json.into_style().align, Some(Align::CenterAcross));
    let style = CellStyle { align: Some(Align::CenterAcross), ..Default::default() };
    assert_eq!(CellFormatJSON::from_style(&style).align.as_deref(), Some("centerAcross"));
    for (wire, expected) in [("left", Align::Left), ("center", Align::Center), ("right", Align::Right)] {
        let old: CellFormatJSON = serde_json::from_str(&format!(r#"{{"align":"{wire}"}}"#)).unwrap();
        assert_eq!(old.into_format().align, expected);
    }

    let mut source = WasmWorkbook::new();
    source.set_text(0, "A1", "Title");
    let format = CellFormatJSON { align: Some("centerAcross".into()), ..Default::default() };
    source.workbook.sheet_mut(0).unwrap().set_format_range(
        CellRange::new(CellAddress::new(0, 0), CellAddress::new(0, 2)),
        format.into_format(),
    );
    let envelope = source.snapshot_persistence_v1_json();
    let mut restored = WasmWorkbook::new();
    restored.restore_persistence_v1_json(envelope).unwrap();
    for addr in ["A1", "B1", "C1"] {
        assert_eq!(
            restored.workbook.sheet(0).unwrap().effective_format(addr).align,
            Align::CenterAcross
        );
    }
}
