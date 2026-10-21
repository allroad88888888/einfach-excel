use super::*;
use serde_json::json;

#[test]
fn native_min_max_number_percent_percentile_and_formula_have_distinct_meaning() {
    let mut book = numbers();
    for (threshold, expected) in [
        (json!({"type":"max"}), "#1a1a1a"),
        (json!({"type":"number","value":"20"}), "#808080"),
        (json!({"type":"percent","value":"50"}), "#333333"),
        (json!({"type":"percentile","value":"50"}), "#ffffff"),
        (json!({"type":"formula","value":"=$B$1*2"}), "#808080"),
    ] {
        book.set_cell(0, "B1", Value::Number(10.0));
        install(&mut book, scale(threshold));
        assert_eq!(color(&book, "A2").as_deref(), Some(expected));
    }
    let mut rule = scale(json!({"type":"max"}));
    rule["minThreshold"] = json!({"type":"min"});
    install(&mut book, rule);
    assert_eq!(color(&book, "A1").as_deref(), Some("#000000"));
    assert_eq!(color(&book, "A1000").as_deref(), Some("#ffffff"));
}

#[test]
fn percentile_interpolates_sorted_members_across_additional_ranges_and_skips_non_numbers() {
    let mut book = numbers();
    book.set_cell(0, "C1", Value::Number(30.0));
    book.set_cell(0, "A3", Value::Text("99999".into()));
    book.set_cell(0, "A4", Value::Boolean(true));
    book.set_formula(0, "A5", "=1/0");
    let mut rule = entry("multi", scale(json!({"type":"percentile","value":"50"})), 0);
    rule.additional_ranges.push(range("C1", "C1"));
    WorkbookHistory::default().set_conditional_format_rule(&mut book, 0, 0, rule).unwrap();
    assert_eq!(color(&book, "A2").as_deref(), Some("#808080"));
    for address in ["A3", "A4", "A5", "A6", "B1"] { assert_eq!(color(&book, address), None); }
}

#[test]
fn third_color_and_data_bars_use_explicit_thresholds_with_clamping() {
    let mut book = numbers();
    let mut rule = scale(json!({"type":"number","value":"100"}));
    rule["midColor"] = "#ff0000".into();
    rule["midThreshold"] = json!({"type":"number","value":"10"});
    install(&mut book, rule);
    assert_eq!(color(&book, "A2").as_deref(), Some("#ff0000"));
    install(&mut book, json!({"kind":"data-bar", "minThreshold":{"type":"number","value":"5"},
        "maxThreshold":{"type":"formula","value":"=25"}}));
    let display = book.snapshot_display_format_range(0, range("A1", "A1000")).unwrap();
    let widths: Vec<_> = display.data_bars.iter().map(|(_, bar)| bar.width).collect();
    assert_eq!(widths, [0.0, 25.0, 100.0]);
    assert!(display.data_bars.iter().all(|(_, bar)| bar.left == 0.0 && bar.axis.is_none()));
}

#[test]
fn threshold_formula_is_rule_wide_and_recalculates_when_an_offscreen_dependency_changes() {
    let mut book = numbers();
    book.set_cell(0, "Z1000", Value::Number(20.0));
    install(&mut book, scale(json!({"type":"formula","value":"=Z1000"})));
    assert_eq!(color(&book, "A2").as_deref(), Some("#808080"));
    assert_eq!(color(&book, "A1000").as_deref(), Some("#ffffff"));
    book.set_cell(0, "Z1000", Value::Number(40.0));
    assert_eq!(color(&book, "A2").as_deref(), Some("#404040"));
}

#[test]
fn malformed_thresholds_reject_before_rules_or_history_change() {
    let mut book = numbers();
    let mut history = WorkbookHistory::default();
    for threshold in [json!({"type":"bogus"}), json!({"type":"percent","value":"101"}),
        json!({"type":"percentile","value":"-1"}), json!({"type":"number","value":"NaN"}),
        json!({"type":"formula","value":"=SUM("}), json!({"type":"number","value":10})] {
        assert!(history.set_conditional_format_rule(&mut book, 0, 0, entry("bad", scale(threshold), 0)).is_err());
    }
    assert_eq!(history.undo_count(), 0);
    assert!(book.conditional_format_config(0).unwrap().rules.is_empty());
}

#[test]
fn runtime_formula_errors_and_reversed_endpoints_skip_only_the_invalid_visual() {
    let mut book = numbers();
    for high in [json!({"type":"formula","value":"=1/0"}), json!({"type":"number","value":"-5"}),
        json!({"type":"formula","value":"=\"text\""})] {
        install(&mut book, scale(high));
        assert_eq!(color(&book, "A2"), None);
    }
    let mut empty = Workbook::new();
    install(&mut empty, scale(json!({"type":"max"})));
    assert_eq!(color(&empty, "A1"), None);
}
