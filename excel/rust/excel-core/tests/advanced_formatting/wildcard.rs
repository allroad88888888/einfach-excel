use super::*;

#[test]
fn whole_value_wildcards_preserve_case_spaces_unicode_and_literal_escapes() {
    let mut book = Workbook::new();
    for (index, value) in ["Ready", "READY now", " Ready", "a*b", "a?b", "a~b", "中文🙂", "İ", "SS", ""].iter().enumerate() {
        book.set_cell(0, &format!("A{}", index + 1), Value::Text((*value).into()));
    }
    book.set_formula(0, "A11", "=A1");
    book.set_cell(0, "A12", Value::Number(1.0));
    book.set_formula(0, "A13", "=1/0");
    for (pattern, expected) in [
        ("rEaDy", vec![1, 11]), ("ready*", vec![1, 2, 11]), (" ready", vec![3]),
        ("a~*b", vec![4]), ("a~?b", vec![5]), ("a~~b", vec![6]),
        ("中文?", vec![7]), ("?", vec![8]), ("i\u{307}", vec![8]), ("ß", vec![]),
        ("*", (1..=11).collect()),
    ] {
        install(&mut book, text("matches-wildcard", pattern));
        for row in 1..=14 {
            assert_eq!(bold(&book, &format!("A{row}")), expected.contains(&row), "{pattern} row {row}");
        }
    }
    install(&mut book, text("not-matches-wildcard", "ready*"));
    for row in 1..=14 {
        assert_eq!(bold(&book, &format!("A{row}")), (3..=10).contains(&row), "negative row {row}");
    }
}

#[test]
fn four_literal_conditions_remain_literal_and_keep_trailing_tildes() {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Text(" x*?~".into()));
    book.set_cell(0, "A2", Value::Text("xx".into()));
    for (condition, pattern) in [("contains", "*?"), ("begins-with", " x"), ("ends-with", "~"), ("not-contains", "xx")] {
        install(&mut book, text(condition, pattern));
        assert!(bold(&book, "A1"));
        assert!(!bold(&book, "A2"));
    }
}

#[test]
fn invalid_patterns_reject_atomically_and_can_be_corrected_without_losing_the_rule() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    for pattern in ["".to_string(), "?".repeat(1025), "abc~".into(), "abc~~~".into()] {
        assert!(history.set_conditional_format_rule(&mut book, 0, 0, entry(text("matches-wildcard", &pattern))).is_err());
        assert_eq!(history.undo_count(), 0);
        assert!(book.conditional_format_config(0).unwrap().rules.is_empty());
    }
    book.set_cell(0, "A1", Value::Text("abc~".into()));
    history.set_conditional_format_rule(&mut book, 0, 0, entry(text("matches-wildcard", "abc~~"))).unwrap();
    assert!(bold(&book, "A1"));
    assert_eq!(history.undo_count(), 1);
}

#[test]
fn budget_overflow_skips_both_positive_and_negative_rules_then_short_pattern_recovers() {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Text("a".repeat(20_000)));
    for condition in ["matches-wildcard", "not-matches-wildcard"] {
        install(&mut book, text(condition, &"?".repeat(1024)));
        assert!(!bold(&book, "A1"));
    }
    install(&mut book, text("matches-wildcard", "*"));
    assert!(bold(&book, "A1"));
}
