fn preview_format(wb: &WasmWorkbook, addr: &str, wire: serde_json::Value) -> String {
    wb.number_format_preview(0, addr, serde_json::from_value(wire).unwrap()).unwrap().text.unwrap()
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
            serde_json::from_value(serde_json::json!({"kind":kind})).unwrap()).map(|p| p.text), Err(expected));
    }
}

fn custom_preview(wb: &WasmWorkbook, addr: &str, pattern: &str) -> NumberFormatPreviewJSON {
    wb.number_format_preview(0, addr,
        serde_json::from_value(serde_json::json!({"kind":"custom","pattern":pattern})).unwrap()).unwrap()
}

#[test]
fn custom_preview_matches_grid_text_color_and_reports_invalid_codes() {
    let mut wb = WasmWorkbook::new();
    wb.workbook.set_cell_input(0, "A1", "-1234.5").unwrap();
    wb.workbook.set_cell_input(0, "A2", "late").unwrap();
    let code = "#,##0.00;[Red](#,##0.00);0;\"Note: \"@";
    let negative = custom_preview(&wb, "A1", code);
    assert_eq!((negative.text.as_deref(), negative.color.as_deref()), (Some("(1,234.50)"), Some("#ff0000")));
    assert_eq!(custom_preview(&wb, "A2", code).text.as_deref(), Some("Note: late"));
    assert_eq!(custom_preview(&wb, "A1", "0.0.0").invalid_code, Some("multiple-decimal-points"));
    assert_eq!(custom_preview(&wb, "A1", "\"abc").invalid_code, Some("unclosed-quote"));
    assert_eq!(custom_preview(&wb, "A1", "0;0;0;0;0").invalid_code, Some("too-many-sections"));
    assert_eq!(custom_preview(&wb, "A1", "[Red0").invalid_code, Some("unclosed-bracket"));

    // 网格快照与预览同源：文本、颜色与填充位置都来自同一个 Rust 格式化。
    wb.workbook.sheet_mut(0).unwrap().set_format("A1", CellFormat {
        number_format: NumberFormat::Custom(code.into()), ..Default::default()
    });
    let grid = native_number_display(&wb.workbook, 0, "A1", &Value::Number(-1234.5)).unwrap();
    assert_eq!((grid.text.as_str(), grid.color.as_deref()), ("(1,234.50)", Some("#ff0000")));
    wb.workbook.sheet_mut(0).unwrap().set_format("B1", CellFormat {
        number_format: NumberFormat::Custom("_($* #,##0.00_)".into()), ..Default::default()
    });
    let filled = native_number_display(&wb.workbook, 0, "B1", &Value::Number(1234.5)).unwrap();
    assert_eq!(filled.text, " $1,234.50 ");
    assert_eq!(filled.fill, Some(FormattedCharJSON { ch: " ".into(), at: 2 }));
    assert_eq!(filled.pads, vec![FormattedCharJSON { ch: "(".into(), at: 0 },
        FormattedCharJSON { ch: ")".into(), at: 10 }]);
    wb.workbook.set_cell_input(0, "C1", "7").unwrap();
    let dashes = custom_preview(&wb, "C1", "_W0*-");
    assert_eq!((dashes.text.as_deref(), dashes.fill.clone()),
        (Some(" 7"), Some(FormattedCharJSON { ch: "-".into(), at: 2 })));
    assert_eq!(dashes.pads, vec![FormattedCharJSON { ch: "W".into(), at: 0 }]);
    wb.workbook.set_cell_input(0, "C2", "5.25").unwrap();
    assert_eq!(custom_preview(&wb, "C2", "# ?/?").text.as_deref(), Some("5 1/4"));
}

#[test]
fn display_snapshot_marks_cells_whose_conditional_rule_sets_a_font_color() {
    let mut wb = WasmWorkbook::new();
    wb.workbook.set_cell(0, "A1", Value::Number(9.0));
    wb.workbook.set_cell(0, "A2", Value::Number(9.0));
    for (id, row, format) in [("font", 0u32, serde_json::json!({ "fgColor": "#00B050" })),
        ("fill", 1, serde_json::json!({ "bgColor": "#FFC7CE" }))] {
        let request: SetConditionalFormatRuleJSON = serde_json::from_value(serde_json::json!({
            "revision": 0, "scope": { "range": { "rowStart": row, "rowEnd": row, "colStart": 0, "colEnd": 0 } },
            "rule": { "kind": "cell-value", "operator": "gt", "value": "5", "format": format },
        })).unwrap();
        let mut rule = request.into_entry(id.into()).unwrap();
        rule.priority = i64::from(row);
        wb.history.set_conditional_format_rule(&mut wb.workbook, 0, u64::from(row), rule).unwrap();
    }
    let range = CellRange::new(CellAddress::new(0, 0), CellAddress::new(1, 0));
    let display = wb.workbook.snapshot_display_format_range(0, range).unwrap();
    assert_eq!(display.conditional_font_colors, vec![CellAddress::new(0, 0)]);
}
