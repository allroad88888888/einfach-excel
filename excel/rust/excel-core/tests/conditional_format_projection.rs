//! 原生数值条件判断、只读显示覆盖与基础样式隔离。
#[path = "support/conditional_format_rule.rs"]
mod support;
use einfach_core::Value;
use einfach_excel_core::cell_style::{CellStyle, StyleScope};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, Workbook};
use support::{range, rule};

fn highlighted(book: &Workbook, addr: &str) -> bool {
    book.snapshot_display_format_range(0, range(addr, addr))
        .unwrap()
        .cell_styles
        .iter()
        .any(|(_, style)| style.background == Some(Some("#FFC7CE".into())))
}

#[test]
fn comparisons_are_native_and_boundaries_are_inclusive_only_when_requested() {
    let mut book = Workbook::new();
    for (i, value) in [1.0, 2.0, 3.0, 4.0].into_iter().enumerate() {
        book.set_cell(0, &format!("A{}", i + 1), Value::Number(value));
    }
    for (operator, expected) in [
        ("eq", [false, true, false, false]),
        ("ne", [true, false, true, true]),
        ("gt", [false, false, true, true]),
        ("gte", [false, true, true, true]),
        ("lt", [true, false, false, false]),
        ("lte", [true, true, false, false]),
        ("between", [false, true, true, false]),
        ("not-between", [true, false, false, true]),
    ] {
        let mut entry = rule("r", range("A1", "A4"), operator, "2");
        if operator.contains("between") {
            let mut json: serde_json::Value = serde_json::from_str(&entry.rule_json).unwrap();
            json["value2"] = serde_json::json!("3");
            entry.rule_json = json.to_string();
        }
        let revision = book.conditional_format_config(0).unwrap().revision;
        WorkbookHistory::default()
            .set_conditional_format_rule(&mut book, 0, revision, entry)
            .unwrap();
        for (i, expected) in expected.into_iter().enumerate() {
            assert_eq!(
                highlighted(&book, &format!("A{}", i + 1)),
                expected,
                "{operator} at {i}"
            );
        }
    }
}

#[test]
fn value_edits_and_formula_recalculation_remove_overlays_without_touching_styles() {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Number(4.0));
    book.set_formula(0, "A2", "=A1*2");
    let bounds = range("A1", "A2");
    book.sheet_mut(0).unwrap().patch_format_range(
        bounds,
        StyleScope::Cell,
        CellStyle {
            color: Some(Some("#112233".into())),
            italic: Some(true),
            ..Default::default()
        },
    );
    let base = book.sheet(0).unwrap().snapshot_format_range(bounds);
    book.set_conditional_format_rule(0, 0, rule("r", bounds, "gt", "5"))
        .unwrap();
    assert!(!highlighted(&book, "A1"));
    assert!(highlighted(&book, "A2"));
    book.set_cell(0, "A1", Value::Number(1.0));
    assert!(!highlighted(&book, "A2"));
    assert_eq!(book.sheet(0).unwrap().snapshot_format_range(bounds), base);
}

#[test]
fn blanks_text_booleans_errors_and_nonfinite_numbers_are_not_numeric_matches() {
    let mut book = Workbook::new();
    book.set_cell(0, "A2", Value::Text("8".into()));
    book.set_cell(0, "A3", Value::Boolean(true));
    book.set_formula(0, "A4", "=1/0");
    book.set_formula(0, "A5", "=\"\"");
    book.set_cell(0, "A6", Value::Number(f64::INFINITY));
    book.set_cell(0, "A7", Value::Number(0.0));
    book.set_conditional_format_rule(0, 0, rule("r", range("A1", "A7"), "gte", "0"))
        .unwrap();
    for i in 1..=6 {
        assert!(!highlighted(&book, &format!("A{i}")));
    }
    assert!(highlighted(&book, "A7"));
}

#[test]
fn overlapping_rules_combine_properties_with_stable_priority_and_do_not_split_ranges() {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Number(9.0));
    let mut high = rule("high", range("A1", "A100"), "gt", "5");
    let mut low = high.clone();
    low.id = "low".into();
    low.priority = 1;
    low.rule_json = serde_json::json!({ "kind": "cell-value", "operator": "gt", "value": "0",
        "format": { "background": "#00FF00", "bold": true } })
    .to_string();
    book.set_conditional_format_rule(0, 0, high.clone())
        .unwrap();
    book.set_conditional_format_rule(0, 1, low).unwrap();
    let styles = book
        .snapshot_display_format_range(0, range("A1", "A1"))
        .unwrap()
        .cell_styles;
    assert_eq!(styles[0].1.background, Some(Some("#FFC7CE".into())));
    assert_eq!(styles[0].1.bold, Some(true));
    high.id = "same-priority".into();
    high.rule_json = high.rule_json.replace("#FFC7CE", "#000000");
    book.set_conditional_format_rule(0, 2, high).unwrap();
    assert!(highlighted(&book, "A1"));
    book.set_cell(0, "A56", Value::Number(12.0));
    assert!(highlighted(&book, "A56"));
    assert_eq!(book.conditional_format_config(0).unwrap().rules.len(), 3);
}

#[test]
fn viewport_reads_are_bounded_and_unimplemented_legacy_rules_stay_persisted() {
    let mut book = Workbook::new();
    let mut old = rule("old", range("A1", "A1048576"), "gt", "0");
    old.rule_json = r##"{"kind":"data-bar","maxColor":"#123456"}"##.into();
    book.set_conditional_format_rule(0, 0, old.clone()).unwrap();
    let before = book.snapshot_conditional_formats();
    assert_eq!(
        book.snapshot_display_format_range(0, range("A1", "A2"))
            .unwrap()
            .cell_styles
            .len(),
        0
    );
    assert!(book
        .snapshot_display_format_range(0, range("A1", "A1048576"))
        .is_err());
    assert!(book
        .snapshot_display_format_range(99, range("A1", "A1"))
        .is_err());
    assert_eq!(book.snapshot_conditional_formats(), before);
    let mut restored = Workbook::new();
    restored.restore_conditional_formats(before).unwrap();
    assert_eq!(
        restored.conditional_format_config(0).unwrap().rules,
        vec![old]
    );
}

#[test]
fn spill_anchor_and_children_use_numeric_results_without_creating_base_styles() {
    let mut book = Workbook::new();
    book.set_formula(0, "A1", "=SEQUENCE(3)");
    book.get_cell("Sheet1", "A1");
    book.set_conditional_format_rule(0, 0, rule("r", range("A1", "A3"), "gte", "2"))
        .unwrap();
    assert!(!highlighted(&book, "A1"));
    assert!(highlighted(&book, "A2"));
    assert!(highlighted(&book, "A3"));
    assert!(book
        .sheet(0)
        .unwrap()
        .snapshot_format_range(range("A1", "A3"))
        .cell_styles
        .is_empty());
    assert_eq!(
        book.sheet(0).unwrap().peek_value(CellAddress::new(2, 0)),
        Value::Number(3.0)
    );
}
