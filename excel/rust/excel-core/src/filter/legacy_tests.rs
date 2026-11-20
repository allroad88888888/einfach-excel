use super::*;

#[test]
fn js_number_matches_javascript_on_the_shapes_rust_would_disagree_about() {
    // Every row here was produced by running `Number(x)` in node; see
    // the commit message for the full 7 700-case corpus run.
    assert_eq!(js_numeric_value(""), Some(0.0));
    assert_eq!(js_numeric_value("   "), Some(0.0));
    assert_eq!(js_numeric_value("\u{a0}"), Some(0.0));
    assert_eq!(js_numeric_value("\u{feff}"), Some(0.0));
    // U+0085 is Unicode White_Space but NOT JavaScript whitespace.
    assert_eq!(js_numeric_value("\u{85}"), None);
    assert_eq!(js_numeric_value(" 12 "), Some(12.0));
    assert_eq!(js_numeric_value("0x10"), Some(16.0));
    assert_eq!(js_numeric_value("0b101"), Some(5.0));
    assert_eq!(js_numeric_value("0o17"), Some(15.0));
    assert_eq!(
        js_numeric_value("-0x10"),
        None,
        "a sign voids the radix form"
    );
    assert_eq!(js_numeric_value("0x"), None);
    assert_eq!(js_numeric_value(".5"), Some(0.5));
    assert_eq!(js_numeric_value("5."), Some(5.0));
    assert_eq!(js_numeric_value("."), None);
    assert_eq!(js_numeric_value("+5"), Some(5.0));
    assert_eq!(js_numeric_value("1e3"), Some(1000.0));
    assert_eq!(js_numeric_value("1e-3"), Some(0.001));
    assert_eq!(js_numeric_value("1e"), None);
    assert_eq!(js_numeric_value("1e999"), None, "overflows to Infinity");
    assert_eq!(js_numeric_value("Infinity"), None);
    assert_eq!(js_numeric_value("-Infinity"), None);
    // Rust's own parser accepts all four of these; JavaScript does not.
    assert_eq!(js_numeric_value("inf"), None);
    assert_eq!(js_numeric_value("infinity"), None);
    assert_eq!(js_numeric_value("NaN"), None);
    assert_eq!(js_numeric_value("1_000"), None);
    assert_eq!(js_numeric_value("1,000"), None);
}

#[test]
fn js_trim_uses_the_javascript_whitespace_set() {
    assert_eq!(js_trim("\u{feff} total \u{feff}"), "total");
    assert_eq!(js_trim("\u{85}total"), "\u{85}total");
    assert!(is_filter_sort_summary_row("\u{feff}Total ", 5));
    assert!(!is_filter_sort_summary_row("\u{85}Total", 5));
}

#[test]
fn list_does_not_case_fold_but_equals_does() {
    let list = ColumnFilterRule::List {
        col_index: 0,
        values: vec!["abc".into()],
    };
    let equals = ColumnFilterRule::Equals {
        col_index: 0,
        value: "abc".into(),
        case_sensitive: false,
    };
    assert!(!filter_rule_matches_value(&list, "ABC"));
    assert!(filter_rule_matches_value(&equals, "ABC"));
}

#[test]
fn a_blank_cell_is_zero_for_a_range_rule() {
    // The empty-string consequence spelled out: a band containing 0
    // keeps every blank row visible, a band excluding 0 hides them.
    let containing_zero = ColumnFilterRule::Range {
        col_index: 0,
        min: Some(-1.0),
        max: Some(1.0),
    };
    let excluding_zero = ColumnFilterRule::Range {
        col_index: 0,
        min: Some(1.0),
        max: None,
    };
    assert!(filter_rule_matches_value(&containing_zero, ""));
    assert!(!filter_rule_matches_value(&excluding_zero, ""));
}

#[test]
fn the_summary_row_needs_row_index_above_one() {
    assert!(!is_filter_sort_summary_row("Total", 0));
    assert!(!is_filter_sort_summary_row("Total", 1));
    assert!(is_filter_sort_summary_row("Total", 2));
    assert!(!is_filter_sort_summary_row("Subtotal", 2));
}
