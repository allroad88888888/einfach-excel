//! 文本、重复值的原生判定与响应依赖；离屏数据不靠前端扫描。
#[path = "support/conditional_format_rule.rs"]
mod support;
use einfach_core::Value;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::Workbook;
use serde_json::json;
use support::{range, rule};

fn install(book: &mut Workbook, json: serde_json::Value) {
    let mut entry = rule("r", range("A1", "A1048576"), "gt", "0");
    entry.rule_json = json.to_string();
    let revision = book.conditional_format_config(0).unwrap().revision;
    WorkbookHistory::default()
        .set_conditional_format_rule(book, 0, revision, entry)
        .unwrap();
}
fn bold(book: &Workbook, address: &str) -> bool {
    book.snapshot_display_format_range(0, range(address, address))
        .unwrap()
        .formats
        .cell_styles
        .iter()
        .any(|(_, style)| style.bold == Some(true))
}
fn duplicates(mode: &str) -> serde_json::Value {
    json!({"kind":"duplicate-values","mode":mode,"format":{"bold":true}})
}

#[test]
fn text_conditions_are_literal_case_insensitive_and_preserve_spaces() {
    let mut book = Workbook::new();
    for (index, text) in ["Ready", "READY now", "not ready", " Ready", "x*y", "中文🙂"]
        .iter()
        .enumerate()
    {
        book.set_cell(0, &format!("A{}", index + 1), Value::Text((*text).into()));
    }
    book.set_formula(0, "A7", "=A1");
    book.set_cell(0, "A8", Value::Number(123.0));
    book.set_formula(0, "A9", "=1/0");
    for (condition, text, expected) in [
        ("contains", "rEaDy", vec![1, 2, 3, 4, 7]),
        ("begins-with", "ready", vec![1, 2, 7]),
        ("ends-with", "ready", vec![1, 3, 4, 7]),
        ("not-contains", "ready", vec![5, 6]),
        ("contains", "*", vec![5]),
        ("ends-with", "🙂", vec![6]),
    ] {
        install(
            &mut book,
            json!({"kind":"text","condition":condition,"text":text,"format":{"bold":true}}),
        );
        for row in 1..=10 {
            assert_eq!(
                bold(&book, &format!("A{row}")),
                expected.contains(&row),
                "{condition} {row}"
            );
        }
    }
    book.set_cell(0, "A1", Value::Text("中文🙂".into()));
    assert!(bold(&book, "A7"), "formula result is current");
}

#[test]
fn duplicates_include_offscreen_formula_results_but_distinguish_types_and_whitespace() {
    let mut book = Workbook::new();
    for (addr, value) in [
        ("A1", Value::Text("Alpha".into())),
        ("A2", Value::Text("alpha".into())),
        ("A3", Value::Text(" alpha".into())),
        ("A4", Value::Number(1.0)),
        ("A5", Value::Text("1".into())),
        ("A6", Value::Boolean(true)),
        ("A7", Value::Text("".into())),
        ("A8", Value::Number(-0.0)),
        ("A1000", Value::Number(0.0)),
    ] {
        book.set_cell(0, addr, value);
    }
    book.set_formula(0, "A999", "=A4");
    book.set_formula(0, "A10", "=1/0");
    book.set_formula(0, "A11", "=\"\"");
    install(&mut book, duplicates("duplicate"));
    for row in 1..=11 {
        assert_eq!(
            bold(&book, &format!("A{row}")),
            [1, 2, 4, 8].contains(&row),
            "{row}"
        );
    }
    assert!(bold(&book, "A999"));
    install(&mut book, duplicates("unique"));
    for row in 1..=11 {
        assert_eq!(
            bold(&book, &format!("A{row}")),
            [3, 5, 6].contains(&row),
            "{row}"
        );
    }
}

#[test]
fn scrolling_reuses_statistics_and_edits_clears_and_formula_changes_invalidate_them() {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Number(5.0));
    book.set_cell(0, "Z1", Value::Number(5.0));
    book.set_formula(0, "A900000", "=Z1");
    install(&mut book, duplicates("duplicate"));
    assert!(bold(&book, "A1"));
    let before = book.sheet(0).unwrap().debug_recompute_count();
    for _ in 0..20 {
        assert!(bold(&book, "A1"));
        assert!(bold(&book, "A900000"));
    }
    assert_eq!(book.sheet(0).unwrap().debug_recompute_count(), before);
    book.set_cell(0, "Y1", Value::Number(10.0));
    assert!(bold(&book, "A1"));
    assert_eq!(book.sheet(0).unwrap().debug_recompute_count(), before);
    book.set_cell(0, "Z1", Value::Number(6.0));
    assert!(!bold(&book, "A1"));
    book.set_cell(0, "A700000", Value::Number(5.0));
    assert!(bold(&book, "A1"));
    book.set_cell(0, "A700000", Value::Null);
    assert!(!bold(&book, "A1"));
}

#[test]
fn disjoint_ranges_share_counts_and_spill_members_are_counted_once() {
    let mut book = Workbook::new();
    book.set_formula(0, "A1", "=SEQUENCE(3)");
    book.set_cell(0, "C1", Value::Number(1.0));
    book.set_cell(0, "B1", Value::Number(2.0));
    let mut entry = rule("r", range("A1", "A3"), "gt", "0");
    entry.additional_ranges = vec![range("C1", "C3")];
    entry.rule_json = duplicates("duplicate").to_string();
    WorkbookHistory::default()
        .set_conditional_format_rule(&mut book, 0, 0, entry)
        .unwrap();
    assert!(bold(&book, "A1"));
    assert!(bold(&book, "C1"));
    assert!(!bold(&book, "A2"));
    assert!(!bold(&book, "A3"));
    book.set_formula(0, "A1", "=SEQUENCE(3,1,2)");
    assert!(!bold(&book, "C1"));
}

#[test]
fn invalid_new_rules_reject_before_history_or_configuration_changes() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    for invalid in [
        json!({"kind":"text","condition":"contains","text":"","format":{"bold":true}}),
        json!({"kind":"text","condition":"regex","text":"a","format":{"bold":true}}),
        json!({"kind":"duplicate-values","mode":"all","format":{"bold":true}}),
        json!({"kind":"duplicate-values","mode":"unique","stopIfTrue":"true","format":{"bold":true}}),
        json!({"kind":"data-bar","stopIfTrue":true}),
    ] {
        let mut entry = rule("r", range("A1", "A3"), "gt", "0");
        entry.rule_json = invalid.to_string();
        assert!(history
            .set_conditional_format_rule(&mut book, 0, 0, entry)
            .is_err());
        assert_eq!(history.undo_count(), 0);
        assert!(book.conditional_format_config(0).unwrap().rules.is_empty());
    }
}
