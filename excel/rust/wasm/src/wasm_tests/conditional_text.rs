// 文本、重复值、Stop 的原生 v1 往返：只持久规则，不持久计算出来的显示样式。
#[test]
fn conditional_text_duplicates_and_stop_roundtrip_through_native_persistence() {
    for rule in [
        serde_json::json!({"kind":"text","condition":"contains","text":"alpha",
            "stopIfTrue":true,"format":{"bold":true}}),
        serde_json::json!({"kind":"duplicate-values","mode":"duplicate","format":{"italic":true}}),
        serde_json::json!({"kind":"duplicate-values","mode":"unique","stopIfTrue":true,
            "format":{"underline":true}}),
    ] {
        let mut book = WasmWorkbook::new();
        book.set_text(0, "A1", "Alpha");
        book.set_text(0, "A2", "alpha");
        book.set_text(0, "A3", "Solo");
        assert!(book.set_formula(0, "A4", "=A1"));
        install_visual_rule(&mut book, rule.clone());
        let range = CellRange::new(CellAddress::new(0, 0), CellAddress::new(4, 0));
        let display = book.workbook.snapshot_display_format_range(0, range).unwrap();
        assert!(!display.formats.cell_styles.is_empty());
        let snapshot = book.snapshot_persistence_v1_json();
        assert_eq!(snapshot.conditional_formats[0].rules[0].rule, rule);
        assert!(snapshot.formats.iter().all(|format| format.cell_styles.is_empty()));
        let mut restored = WasmWorkbook::new();
        restored.restore_persistence_v1_json(snapshot).unwrap();
        assert_eq!(restored.workbook.snapshot_display_format_range(0, range).unwrap(), display);
        assert_eq!(restored.history.undo_count(), 0);
        restored.set_text(0, "A1", "changed");
        assert_ne!(restored.workbook.snapshot_display_format_range(0, range).unwrap(), display);
    }
}
