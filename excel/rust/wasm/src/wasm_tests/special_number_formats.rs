#[test]
fn special_wire_and_preview_preserve_values_text_and_history() {
    let mut wb = WasmWorkbook::new();
    wb.workbook.set_cell_input(0, "A1", "=123+0.5").unwrap();
    wb.workbook.set_cell_input(0, "B1", "'00123").unwrap();
    for (preset, locale, expected) in [("zip-code", "en-US", "00124"),
        ("zip-plus-4", "en-US", "00000-0124"), ("phone-us", "en-US", "-124"),
        ("ssn-us", "en-US", "000-00-0124"), ("postal-code-cn", "zh-CN", "000124")] {
        let wire = serde_json::json!({"kind":"special", "preset":preset});
        let native = serde_json::from_value::<NumberFormatJSON>(wire.clone()).unwrap().into_number_format();
        let encoded = serde_json::to_value(NumberFormatJSON::from_number_format(&native)).unwrap();
        assert_eq!(encoded["locale"], locale);
        assert!(uses_native_number_display(&native));
        let before = serde_json::to_value(wb.snapshot_persistence_v1_json()).unwrap();
        let history = (wb.history.undo_count(), wb.history.redo_count());
        for (addr, expected) in [("A1", expected), ("B1", "00123")] {
            let preview = wb.number_format_preview(0, addr, serde_json::from_value(wire.clone()).unwrap()).unwrap();
            assert_eq!(preview.text.as_deref(), Some(expected));
        }
        assert_eq!(serde_json::to_value(wb.snapshot_persistence_v1_json()).unwrap(), before);
        assert_eq!((wb.history.undo_count(), wb.history.redo_count()), history);
    }
}

#[test]
fn special_invalid_wire_rejects_before_the_workbook_changes() {
    let wb = WasmWorkbook::new();
    let before = serde_json::to_value(wb.snapshot_persistence_v1_json()).unwrap();
    for invalid in [serde_json::json!({"kind":"special"}),
        serde_json::json!({"kind":"special","preset":"missing"}),
        serde_json::json!({"kind":"special","preset":"zip-code","locale":"zh-CN"}),
        serde_json::json!({"kind":"special","preset":"postal-code-cn","locale":"en-US"}),
        serde_json::json!({"kind":"special","preset":"phone-us","locale":"en-GB"}),
        serde_json::json!({"kind":"number","preset":"missing"})] {
        assert!(serde_json::from_value::<CellFormatJSON>(serde_json::json!({"numberFormat":invalid})).is_err());
        assert_eq!(serde_json::to_value(wb.snapshot_persistence_v1_json()).unwrap(), before);
    }
}

#[test]
fn special_formats_survive_all_style_scopes_and_native_restore() {
    let mut source = WasmWorkbook::new();
    for (scope, row) in [(StyleScope::Column, 0), (StyleScope::Row, 1), (StyleScope::Cell, 2)] {
        source.workbook.sheet_mut(0).unwrap().patch_format_range(
            CellRange::single(CellAddress::new(row, row)), scope,
            CellStyle { number_format: Some(NumberFormat::Special(einfach_excel_core::SpecialPreset::PostalCodeCn)),
                ..Default::default() });
    }
    source.workbook.set_cell_input(0, "A1", "00123").unwrap();
    source.workbook.set_cell_input(0, "B2", "=123").unwrap();
    source.workbook.set_cell_input(0, "C3", "'00123").unwrap();
    let saved = serde_json::to_value(source.snapshot_persistence_v1_json()).unwrap();
    let mut restored = WasmWorkbook::new();
    restored.restore_persistence_v1_json(serde_json::from_value(saved).unwrap()).unwrap();
    assert_eq!(restored.workbook.sheet(0).unwrap().formatted_display("A1"), "000123");
    assert_eq!(restored.workbook.sheet(0).unwrap().formatted_display("B2"), "000123");
    assert_eq!(restored.workbook.sheet(0).unwrap().formatted_display("C3"), "00123");
    assert_eq!(restored.get_formula(0, "B2"), "=123");
    assert_eq!(restored.get_number(0, "A1"), 123.0);
}
