use super::*;
use serde_json::json;

fn indices(book: &Workbook) -> Vec<u8> {
    book.snapshot_display_format_range(0, range("A1", "A1000")).unwrap().conditional_icons
        .into_iter().map(|(_, icon)| icon.index).collect()
}

#[test]
fn three_icon_styles_reverse_and_icon_only_metadata_are_native() {
    let mut book = numbers();
    for set in ["three-arrows", "three-traffic-lights", "three-flags"] {
        let rule = json!({"kind":"icon-set", "iconSet":set,
            "lowerThreshold":{"type":"number","value":"10"}, "upperThreshold":{"type":"number","value":"50"}});
        install(&mut book, rule.clone());
        assert_eq!(indices(&book), [0, 1, 2]);
        let mut reverse = rule;
        reverse["reverse"] = true.into(); reverse["showValue"] = false.into();
        install(&mut book, reverse);
        assert_eq!(indices(&book), [2, 1, 0]);
        let snapshot = book.snapshot_display_format_range(0, range("A1", "A2")).unwrap();
        assert!(snapshot.conditional_icons.iter().all(|(_, icon)| !icon.show_value));
        assert_eq!(book.get_cell("Sheet1", "A2"), Value::Number(10.0));
    }
}

#[test]
fn icons_use_percentile_and_formula_thresholds_and_ignore_text_and_errors() {
    let mut book = numbers();
    book.set_cell(0, "B1", Value::Number(50.0));
    book.set_cell(0, "A3", Value::Text("50".into()));
    book.set_formula(0, "A4", "=1/0");
    install(&mut book, json!({"kind":"icon-set","iconSet":"three-arrows",
        "lowerThreshold":{"type":"percentile","value":"50"},
        "upperThreshold":{"type":"formula","value":"=$B$1"}}));
    assert_eq!(indices(&book), [0, 1, 2]);
    book.set_cell(0, "B1", Value::Number(10.0));
    assert_eq!(indices(&book), [0, 2, 2]);
}

#[test]
fn priority_combines_icons_with_text_and_fill_but_stop_blocks_lower_visuals() {
    let mut book = numbers();
    install(&mut book, json!({"kind":"icon-set", "iconSet":"three-flags"}));
    let mut history = WorkbookHistory::default();
    history.set_conditional_format_rule(&mut book, 0, 1, entry("highlight", json!({"kind":"cell-value",
        "operator":"gte", "value":"10", "format":{"bgColor":"#112233","fgColor":"#445566"}}), -1)).unwrap();
    assert_eq!(indices(&book), [0, 0, 2]);
    let snapshot = book.snapshot_display_format_range(0, range("A2", "A2")).unwrap();
    assert_eq!(snapshot.formats.cell_styles[0].1.color, Some(Some("#445566".into())));
    let mut stop = entry("highlight", json!({"kind":"cell-value", "operator":"gte", "value":"10",
        "stopIfTrue":true, "format":{"bgColor":"#112233"}}), -1);
    stop.row_end = 999;
    history.set_conditional_format_rule(&mut book, 0, 2, stop).unwrap();
    assert_eq!(indices(&book), [0]);
    assert_eq!(color(&book, "A2").as_deref(), Some("#112233"));
    history.undo(&mut book).unwrap();
    assert_eq!(indices(&book), [0, 0, 2]);
    assert!(book.sheet(0).unwrap().snapshot_format_range(range("A1", "A1000")).cell_styles.is_empty());
}
