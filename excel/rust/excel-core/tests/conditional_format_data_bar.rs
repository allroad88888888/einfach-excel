//! 数据条包含全范围统计、负数零轴、原生历史；几何与基础格式隔离。
#[path = "support/conditional_format_rule.rs"]
mod support;
use einfach_core::Value;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::workbook::ConditionalFormatRuleAction;
use einfach_excel_core::{DataBarDisplay, Workbook};
use support::{range, rule};

fn install(book: &mut Workbook, history: &mut WorkbookHistory, end: &str) {
    let mut entry = rule("bar", range("A1", end), "gt", "0");
    entry.rule_json = serde_json::json!({"kind":"data-bar", "minColor":"#ff0000", "maxColor":"#0000ff"}).to_string();
    let revision = book.conditional_format_config(0).unwrap().revision;
    history.set_conditional_format_rule(book, 0, revision, entry).unwrap();
}

fn bar(book: &Workbook, address: &str) -> Option<DataBarDisplay> {
    book.snapshot_display_format_range(0, range(address, address)).unwrap()
        .data_bars.into_iter().next().map(|(_, bar)| bar)
}

fn near(left: f64, right: f64) { assert!((left - right).abs() < 0.00001, "{left} != {right}"); }

#[test]
fn positive_bars_use_zero_and_the_offscreen_maximum() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    for (address, value) in [("A1", 1.0), ("A2", 2.0), ("A999", 4.0)] {
        book.set_cell(0, address, Value::Number(value));
    }
    install(&mut book, &mut history, "A1000");
    let first = bar(&book, "A1").unwrap();
    assert_eq!(first, DataBarDisplay { left: 0.0, width: 25.0, axis: None, color: "#0000ff".into() });
    near(bar(&book, "A2").unwrap().width, 50.0);
    near(bar(&book, "A999").unwrap().width, 100.0);
    assert!(book.sheet(0).unwrap().snapshot_format_range(range("A1", "A1000")).cell_styles.is_empty());
}

#[test]
fn mixed_signs_share_one_zero_axis_and_negative_bars_extend_left() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    for (address, value) in [("A1", -10.0), ("A2", 0.0), ("A3", 20.0)] {
        book.set_cell(0, address, Value::Number(value));
    }
    install(&mut book, &mut history, "A3");
    let negative = bar(&book, "A1").unwrap();
    let zero = bar(&book, "A2").unwrap();
    let positive = bar(&book, "A3").unwrap();
    near(negative.left, 0.0); near(negative.width, 100.0 / 3.0);
    near(positive.left, 100.0 / 3.0); near(positive.width, 200.0 / 3.0);
    assert_eq!(negative.color, "#ff0000");
    assert_eq!(negative.axis, positive.axis);
    assert_eq!(zero.width, 0.0);
}

#[test]
fn zero_equal_negative_and_extreme_values_produce_no_nan_or_infinite_geometry() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    book.set_cell(0, "A1", Value::Number(0.0));
    install(&mut book, &mut history, "A2");
    assert_eq!(bar(&book, "A1").unwrap().width, 0.0);
    book.set_cell(0, "A1", Value::Number(-5.0));
    book.set_cell(0, "A2", Value::Number(-5.0));
    assert_eq!(bar(&book, "A1").unwrap(), DataBarDisplay {
        left: 0.0, width: 100.0, axis: Some(100.0), color: "#ff0000".into(),
    });
    book.set_cell(0, "A1", Value::Number(-f64::MAX));
    book.set_cell(0, "A2", Value::Number(f64::MAX));
    for address in ["A1", "A2"] {
        let value = bar(&book, address).unwrap();
        assert_eq!(value.axis, Some(50.0));
        assert_eq!(value.width, 50.0);
    }
}

#[test]
fn formula_members_refresh_and_non_numbers_never_receive_a_bar() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    book.set_cell(0, "Z1", Value::Number(4.0));
    book.set_formula(0, "A1", "=Z1");
    book.set_cell(0, "A2", Value::Number(2.0));
    book.set_cell(0, "A3", Value::Text("9".into()));
    book.set_cell(0, "A4", Value::Boolean(true));
    book.set_formula(0, "A5", "=1/0");
    install(&mut book, &mut history, "A1048576");
    assert_eq!(bar(&book, "A2").unwrap().width, 50.0);
    let before = book.sheet(0).unwrap().debug_recompute_count();
    for _ in 0..10 { bar(&book, "A1"); bar(&book, "A2"); }
    assert_eq!(book.sheet(0).unwrap().debug_recompute_count(), before);
    book.set_cell(0, "Z1", Value::Number(8.0));
    assert_eq!(bar(&book, "A2").unwrap().width, 25.0);
    for address in ["A3", "A4", "A5", "A6"] { assert!(bar(&book, address).is_none()); }
}

#[test]
fn disable_undo_and_persistence_restore_rule_but_never_bake_bar_into_style() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    book.set_cell(0, "A1", Value::Number(2.0));
    install(&mut book, &mut history, "A2");
    let saved = book.snapshot_conditional_formats();
    let before = bar(&book, "A1");
    history.manage_conditional_format_rule(&mut book, 0, 1, "bar", ConditionalFormatRuleAction::Disable).unwrap();
    assert!(bar(&book, "A1").is_none());
    history.undo(&mut book).unwrap();
    assert_eq!(bar(&book, "A1"), before);
    book.restore_conditional_formats(Vec::new()).unwrap();
    assert!(bar(&book, "A1").is_none());
    book.restore_conditional_formats(saved).unwrap();
    assert_eq!(bar(&book, "A1"), before);
    assert!(book.sheet(0).unwrap().snapshot_format_range(range("A1", "A2")).cell_styles.is_empty());
}
