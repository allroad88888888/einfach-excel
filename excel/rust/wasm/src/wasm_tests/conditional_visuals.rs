// 色阶与数据条只属于显示投影；保存的是规则，不是计算后的填充或几何。
fn install_visual_rule(book: &mut WasmWorkbook, rule: serde_json::Value) {
    let request: SetConditionalFormatRuleJSON = serde_json::from_value(serde_json::json!({
        "revision": 0,
        "scope": { "range": { "rowStart": 0, "rowEnd": 4, "colStart": 0, "colEnd": 0 } },
        "rule": rule,
    }))
    .unwrap();
    book.history
        .set_conditional_format_rule(
            &mut book.workbook,
            0,
            0,
            request.into_entry("visual".into()).unwrap(),
        )
        .unwrap();
}

#[test]
fn visual_rules_restore_display_without_persisting_computed_styles_or_bars() {
    for rule in [
        serde_json::json!({"kind":"color-scale", "minColor":"#000000", "maxColor":"#ffffff"}),
        serde_json::json!({"kind":"color-scale", "minColor":"#000000",
            "midColor":"#ff0000", "maxColor":"#ffffff"}),
        serde_json::json!({"kind":"data-bar", "minColor":"#ff0000", "maxColor":"#0000ff"}),
    ] {
        let mut source = WasmWorkbook::new();
        for (index, value) in [-10.0, 0.0, 5.0, 10.0, 20.0].into_iter().enumerate() {
            source.set_number(0, &format!("A{}", index + 1), value);
        }
        let base_formats =
            serde_json::to_value(source.snapshot_persistence_v1_json().formats).unwrap();
        install_visual_rule(&mut source, rule.clone());
        let range = CellRange::new(CellAddress::new(0, 0), CellAddress::new(4, 0));
        let display = source
            .workbook
            .snapshot_display_format_range(0, range)
            .unwrap();
        let payload = source.snapshot_persistence_v1_json();
        assert_eq!(
            serde_json::to_value(&payload.formats).unwrap(),
            base_formats
        );
        assert_eq!(payload.conditional_formats[0].rules[0].rule, rule);
        let mut restored = WasmWorkbook::new();
        restored.restore_persistence_v1_json(payload).unwrap();
        assert_eq!(
            restored
                .workbook
                .snapshot_display_format_range(0, range)
                .unwrap(),
            display
        );
        assert_eq!(restored.history.undo_count(), 0);
        assert_eq!(
            serde_json::to_value(restored.snapshot_persistence_v1_json().formats).unwrap(),
            base_formats
        );
        restored.set_number(0, "A5", 100.0);
        assert_ne!(
            restored
                .workbook
                .snapshot_display_format_range(0, range)
                .unwrap(),
            display
        );
    }
}

#[test]
fn restored_spill_members_contribute_to_bar_statistics_without_becoming_real_cells() {
    let mut source = WasmWorkbook::new();
    assert!(source.set_formula(0, "A1", "=SEQUENCE(5)"));
    install_visual_rule(&mut source, serde_json::json!({"kind":"data-bar"}));
    let range = CellRange::new(CellAddress::new(0, 0), CellAddress::new(4, 0));
    let display = source
        .workbook
        .snapshot_display_format_range(0, range)
        .unwrap();
    let widths: Vec<_> = display.data_bars.iter().map(|(_, bar)| bar.width).collect();
    assert_eq!(widths, vec![20.0, 40.0, 60.0, 80.0, 100.0]);
    let payload = source.snapshot_persistence_v1_json();
    assert_eq!(payload.cells.len(), 1, "only the spill anchor is persisted");
    assert!(payload
        .formats
        .iter()
        .all(|format| format.cell_styles.is_empty()));
    let mut restored = WasmWorkbook::new();
    restored.restore_persistence_v1_json(payload).unwrap();
    assert_eq!(
        restored
            .workbook
            .snapshot_display_format_range(0, range)
            .unwrap(),
        display
    );
    assert!(restored.set_formula(0, "A1", "=SEQUENCE(3)"));
    let changed = restored
        .workbook
        .snapshot_display_format_range(0, range)
        .unwrap();
    assert_eq!(changed.data_bars.len(), 3);
    assert_eq!(changed.data_bars[2].1.width, 100.0);
}

#[test]
fn visual_snapshot_wire_flattens_geometry_and_preserves_the_base_snapshot_shape() {
    let mut book = WasmWorkbook::new();
    book.set_number(0, "A1", 2.0);
    install_visual_rule(&mut book, serde_json::json!({"kind":"data-bar"}));
    let range = CellRange::single(CellAddress::new(0, 0));
    let display = book
        .workbook
        .snapshot_display_format_range(0, range)
        .unwrap();
    let wire = DisplayFormatRangeSnapshotJSON {
        conditional_icons: Vec::new(),
        formats: FormatRangeSnapshotJSON::from_snapshot(&display.formats, Some(0)),
        data_bars: display
            .data_bars
            .into_iter()
            .map(|(addr, bar)| DisplayDataBarJSON {
                addr: addr.to_string(),
                bar,
            })
            .collect(),
    };
    let json = serde_json::to_value(wire).unwrap();
    assert_eq!(json["sheet"], 0);
    assert_eq!(json["cellStyles"], serde_json::json!([]));
    assert_eq!(
        json["dataBars"],
        serde_json::json!([
            {"addr":"A1", "left":0.0, "width":100.0, "color":"#638ec6"}
        ])
    );
    assert!(json.get("formats").is_none());
    assert!(json["dataBars"][0].get("axis").is_none());
}
