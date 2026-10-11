//! 色阶统计完整范围，但只输出显示窗口，不修改持久基础样式。
#[path = "support/conditional_format_rule.rs"]
mod support;
use einfach_core::Value;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, Workbook};
use support::{range, rule};

fn install(book: &mut Workbook, end: &str, middle: bool) {
    let mut entry = rule("scale", range("A1", end), "gt", "0");
    let mut json =
        serde_json::json!({"kind":"color-scale", "minColor":"#000000", "maxColor":"#ffffff"});
    if middle {
        json["midColor"] = "#ff0000".into();
    }
    entry.rule_json = json.to_string();
    let revision = book.conditional_format_config(0).unwrap().revision;
    WorkbookHistory::default()
        .set_conditional_format_rule(book, 0, revision, entry)
        .unwrap();
}

fn color(book: &Workbook, address: &str) -> Option<String> {
    book.snapshot_display_format_range(0, range(address, address))
        .unwrap()
        .formats
        .cell_styles
        .into_iter()
        .find_map(|(_, style)| style.background.flatten())
}

#[test]
fn two_colors_use_offscreen_extremes_and_leave_base_formats_untouched() {
    let mut book = Workbook::new();
    for (addr, value) in [("A1", 0.0), ("A2", 5.0), ("A1000", 100.0)] {
        book.set_cell(0, addr, Value::Number(value));
    }
    let before = book
        .sheet(0)
        .unwrap()
        .snapshot_format_range(range("A1", "A1000"));
    install(&mut book, "A1000", false);
    assert_eq!(color(&book, "A1"), Some("#000000".into()));
    assert_eq!(color(&book, "A2"), Some("#0d0d0d".into()));
    assert_eq!(color(&book, "A1000"), Some("#ffffff".into()));
    assert_eq!(
        book.sheet(0)
            .unwrap()
            .snapshot_format_range(range("A1", "A1000")),
        before
    );
    assert!(book
        .snapshot_display_format_range(0, range("A1", "A3"))
        .unwrap()
        .data_bars
        .is_empty());
}

#[test]
fn three_colors_use_numeric_median_not_the_midpoint_of_min_and_max() {
    let mut book = Workbook::new();
    for (i, value) in [0.0, 1.0, 2.0, 100.0].into_iter().enumerate() {
        book.set_cell(0, &format!("A{}", i + 1), Value::Number(value));
    }
    book.set_cell(0, "A5", Value::Text("99999".into()));
    book.set_cell(0, "A6", Value::Boolean(true));
    book.set_formula(0, "A7", "=1/0");
    install(&mut book, "A1048576", true);
    assert_eq!(color(&book, "A1"), Some("#000000".into()));
    assert_eq!(color(&book, "A2"), Some("#aa0000".into()));
    assert_eq!(color(&book, "A3"), Some("#ff0101".into()));
    assert_eq!(color(&book, "A4"), Some("#ffffff".into()));
    for address in ["A5", "A6", "A7", "A8"] {
        assert_eq!(color(&book, address), None);
    }
}

#[test]
fn dependencies_recompute_but_scrolling_and_unrelated_edits_reuse_the_atom() {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Number(0.0));
    book.set_cell(0, "A2", Value::Number(5.0));
    book.set_cell(0, "Z1", Value::Number(10.0));
    book.set_formula(0, "A999", "=Z1");
    install(&mut book, "A1048576", false);
    assert_eq!(color(&book, "A2"), Some("#808080".into()));
    let before = book.sheet(0).unwrap().debug_recompute_count();
    for _ in 0..10 {
        color(&book, "A1");
        color(&book, "A999");
    }
    book.set_cell(0, "Z2", Value::Number(99.0));
    color(&book, "A2");
    assert_eq!(book.sheet(0).unwrap().debug_recompute_count(), before);
    book.set_cell(0, "Z1", Value::Number(20.0));
    assert_eq!(color(&book, "A2"), Some("#404040".into()));
    book.set_cell(0, "A900000", Value::Number(100.0));
    assert_eq!(color(&book, "A2"), Some("#0d0d0d".into()));
}

#[test]
fn equal_and_extreme_values_have_finite_deterministic_colors() {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Number(5.0));
    book.set_cell(0, "A2", Value::Number(5.0));
    install(&mut book, "A2", false);
    assert_eq!(color(&book, "A1"), Some("#000000".into()));
    install(&mut book, "A2", true);
    assert_eq!(color(&book, "A1"), Some("#ffffff".into()));
    book.set_cell(0, "A1", Value::Number(-f64::MAX));
    book.set_cell(0, "A2", Value::Number(0.0));
    book.set_cell(0, "A3", Value::Number(f64::MAX));
    install(&mut book, "A3", false);
    assert_eq!(color(&book, "A2"), Some("#808080".into()));
    install(&mut book, "A3", true);
    assert_eq!(color(&book, "A2"), Some("#ff0000".into()));
}

#[test]
fn median_preserves_subnormal_values_without_overflowing_large_values() {
    let tiny = f64::from_bits(1);
    for numbers in [
        [0.0, tiny, tiny, 2.0 * tiny],
        [-2.0 * tiny, -tiny, -tiny, 0.0],
        [0.0, f64::MAX * 0.75, f64::MAX * 0.75, f64::MAX],
    ] {
        let mut book = Workbook::new();
        for (index, number) in numbers.into_iter().enumerate() {
            book.set_cell(0, &format!("A{}", index + 1), Value::Number(number));
        }
        install(&mut book, "A4", true);
        assert_eq!(color(&book, "A1"), Some("#000000".into()));
        assert_eq!(color(&book, "A2"), Some("#ff0000".into()));
        assert_eq!(color(&book, "A3"), Some("#ff0000".into()));
        assert_eq!(color(&book, "A4"), Some("#ffffff".into()));
    }
}

#[test]
fn higher_priority_highlight_overrides_color_scale_and_undo_restores_it() {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Number(8.0));
    install(&mut book, "A2", false);
    let mut high = rule("high", range("A1", "A2"), "gt", "0");
    high.priority = -1;
    let mut history = WorkbookHistory::default();
    history
        .set_conditional_format_rule(&mut book, 0, 1, high)
        .unwrap();
    assert_eq!(color(&book, "A1"), Some("#FFC7CE".into()));
    history.undo(&mut book).unwrap();
    assert_eq!(color(&book, "A1"), Some("#000000".into()));
    assert_eq!(
        book.sheet(0).unwrap().peek_value(CellAddress::new(0, 0)),
        Value::Number(8.0)
    );
}

#[test]
fn malformed_colors_or_layout_fields_are_rejected_before_history_changes() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    for extra in [
        serde_json::json!({"minColor":"red"}),
        serde_json::json!({"midColor":"#xx0000"}),
        serde_json::json!({"height":99}),
        serde_json::json!({"enabled":null}),
    ] {
        let mut json =
            serde_json::json!({"kind":"color-scale", "minColor":"#000000", "maxColor":"#ffffff"});
        json.as_object_mut()
            .unwrap()
            .extend(extra.as_object().unwrap().clone());
        let mut entry = rule("bad", range("A1", "A2"), "gt", "0");
        entry.rule_json = json.to_string();
        assert!(history
            .set_conditional_format_rule(&mut book, 0, 0, entry)
            .is_err());
    }
    assert_eq!(history.undo_count(), 0);
    assert!(book.snapshot_conditional_formats().is_empty());
}
