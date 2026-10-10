fn preview_format(wb: &WasmWorkbook, addr: &str, wire: serde_json::Value) -> String {
    wb.number_format_preview(0, addr, serde_json::from_value(wire).unwrap()).unwrap()
}

#[test]
fn preview_uses_actual_formula_result_without_mutating_format_value_or_history() {
    let mut wb = WasmWorkbook::new();
    wb.workbook.set_cell_input(0, "A1", "=2+0.5").unwrap();
    wb.workbook.sheet_mut(0).unwrap().set_format("A1", CellFormat {
        bold: true, number_format: NumberFormat::Percent { digits: 1 }, ..Default::default()
    });
    // 先读一次公式，再证明预览不改变持久化状态。
    assert_eq!(wb.workbook_value(0, "A1"), Value::Number(2.5));
    let before = serde_json::to_value(wb.snapshot_persistence_v1_json()).unwrap();
    for (wire, expected) in [
        (serde_json::json!({"kind":"general"}), "2.5"),
        (serde_json::json!({"kind":"number","digits":3}), "2.500"),
        (serde_json::json!({"kind":"percent","digits":0}), "250%"),
        (serde_json::json!({"kind":"currency","symbol":"€","digits":2}), "€2.50"),
        (serde_json::json!({"kind":"scientific","digits":2}), "2.50E+00"),
        (serde_json::json!({"kind":"fraction","denominator":8}), "2 4/8"),
        (serde_json::json!({"kind":"time","pattern":"[h]:mm:ss"}), "60:00:00"),
        (serde_json::json!({"kind":"date","pattern":"dd-mmm-yy"}), "02-Jan-00"),
        (serde_json::json!({"kind":"text"}), "2.5"),
    ] {
        assert_eq!(preview_format(&wb, "a1", wire), expected);
        assert_eq!(serde_json::to_value(wb.snapshot_persistence_v1_json()).unwrap(), before);
        assert_eq!(wb.history.undo_count(), 0);
        assert_eq!(wb.history.redo_count(), 0);
    }
}

#[test]
fn preview_preserves_text_blank_boolean_and_error_values() {
    let mut wb = WasmWorkbook::new();
    for (addr, input) in [("A1", "'00123"), ("A2", "TRUE"), ("A3", "=1/0"), ("A5", "=\"\"")] {
        wb.workbook.set_cell_input(0, addr, input).unwrap();
    }
    for kind in ["number", "percent", "date", "text"] {
        for (addr, expected) in [("A1", "00123"), ("A2", "TRUE"), ("A3", "#DIV/0!"),
            ("A4", ""), ("A5", "")] {
            assert_eq!(preview_format(&wb, addr, serde_json::json!({"kind":kind})), expected);
        }
    }
}

#[test]
fn preview_rejects_missing_targets_and_unknown_categories() {
    let wb = WasmWorkbook::new();
    for (sheet, addr, kind, expected) in [(99, "A1", "number", "INVALID_SHEET"),
        (0, "invalid", "number", "INVALID_ADDRESS"), (0, "A0", "number", "INVALID_ADDRESS"),
        (0, "XFE1", "number", "INVALID_ADDRESS"), (0, "A1048577", "number", "INVALID_ADDRESS"),
        (0, "A1", "unknown", "INVALID_NUMBER_FORMAT")] {
        assert_eq!(wb.number_format_preview(sheet, addr,
            serde_json::from_value(serde_json::json!({"kind":kind})).unwrap()), Err(expected));
    }
}
