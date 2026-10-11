//! 排名阈值读取整个范围，滚动复用 atom，依赖编辑才重算。
#[path = "support/conditional_format_rule.rs"]
mod support;
use einfach_core::Value;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::Workbook;
use support::{range, rule};

fn install(book: &mut Workbook, end: &str, count: u32, percent: bool, bottom: bool) {
    let mut entry = rule("rank", range("A1", end), "gt", "0");
    entry.rule_json = serde_json::json!({"kind":"top-bottom", "count":count,
        "direction":if bottom {"bottom"} else {"top"}, "percent":percent,
        "format":{"bold":true}})
    .to_string();
    let revision = book.conditional_format_config(0).unwrap().revision;
    WorkbookHistory::default()
        .set_conditional_format_rule(book, 0, revision, entry)
        .unwrap();
}

fn bold(book: &Workbook, address: &str) -> bool {
    book.snapshot_display_format_range(0, range(address, address))
        .unwrap().formats
        .cell_styles
        .iter()
        .any(|(_, style)| style.bold == Some(true))
}

#[test]
fn top_and_bottom_include_boundary_ties_and_offscreen_values() {
    let mut book = Workbook::new();
    for (address, number) in [("A1", 8.0), ("A2", 8.0), ("A999", 2.0), ("A1000", 10.0)] {
        book.set_cell(0, address, Value::Number(number));
    }
    install(&mut book, "A1000", 2, false, false);
    assert!(bold(&book, "A1"));
    assert!(bold(&book, "A2"));
    assert!(bold(&book, "A1000"));
    assert!(!bold(&book, "A999"));
    install(&mut book, "A1000", 1, false, false);
    assert!(!bold(&book, "A1"));
    install(&mut book, "A1000", 2, false, true);
    assert!(bold(&book, "A1"));
    assert!(bold(&book, "A2"));
    assert!(bold(&book, "A999"));
    assert!(!bold(&book, "A1000"));
}

#[test]
fn percentage_uses_numeric_count_rounds_down_and_ignores_non_numbers() {
    let mut book = Workbook::new();
    for i in 1..=7 {
        book.set_cell(0, &format!("A{i}"), Value::Number(i as f64));
    }
    book.set_cell(0, "A8", Value::Text("999".into()));
    book.set_cell(0, "A9", Value::Boolean(true));
    book.set_formula(0, "A10", "=1/0");
    install(&mut book, "A1048576", 20, true, false);
    for i in 1..=11 {
        assert_eq!(bold(&book, &format!("A{i}")), i == 7);
    }
    install(&mut book, "A1048576", 20, true, true);
    for i in 1..=11 {
        assert_eq!(bold(&book, &format!("A{i}")), i == 1);
    }
}

#[test]
fn scrolling_and_unrelated_edits_do_not_recompute_the_range_threshold() {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Number(3.0));
    book.set_cell(0, "A1000", Value::Number(7.0));
    install(&mut book, "A1048576", 1, false, false);
    assert!(bold(&book, "A1000"));
    let before = book.sheet(0).unwrap().debug_recompute_count();
    for _ in 0..20 {
        assert!(!bold(&book, "A1"));
        assert!(bold(&book, "A1000"));
    }
    assert_eq!(book.sheet(0).unwrap().debug_recompute_count(), before);
    book.set_cell(0, "Z1", Value::Number(90.0));
    assert!(bold(&book, "A1000"));
    assert_eq!(book.sheet(0).unwrap().debug_recompute_count(), before);
    book.set_cell(0, "A900000", Value::Number(9.0));
    assert!(!bold(&book, "A1000"));
    assert!(bold(&book, "A900000"));
}

#[test]
fn formula_dependencies_new_members_clears_and_type_changes_invalidate_atom() {
    let mut book = Workbook::new();
    book.set_cell(0, "Z1", Value::Number(1.0));
    book.set_cell(0, "A1", Value::Number(5.0));
    book.set_formula(0, "A2", "=Z1*2");
    install(&mut book, "A1000", 1, false, false);
    assert!(bold(&book, "A1"));
    book.set_cell(0, "Z1", Value::Number(5.0));
    assert!(!bold(&book, "A1"));
    assert!(bold(&book, "A2"));
    book.set_cell(0, "A2", Value::Text("100".into()));
    assert!(bold(&book, "A1"));
    book.set_cell(0, "A900", Value::Number(12.0));
    assert!(!bold(&book, "A1"));
    book.clear_range(0, range("A900", "A900"));
    assert!(bold(&book, "A1"));
}

#[test]
fn empty_range_and_more_items_than_numeric_members_are_well_defined() {
    let mut book = Workbook::new();
    install(&mut book, "A4", 1000, false, false);
    assert!(!bold(&book, "A1"));
    book.set_cell(0, "A1", Value::Number(-8.0));
    assert!(bold(&book, "A1"));
    book.set_cell(0, "A4", Value::Number(0.0));
    assert!(bold(&book, "A4"));
    assert!(book
        .sheet(0)
        .unwrap()
        .snapshot_format_range(range("A1", "A4"))
        .cell_styles
        .is_empty());
}

#[test]
fn invalid_ranks_are_rejected_before_mutation() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    for (count, percent) in [
        (0.0, false),
        (1001.0, false),
        (101.0, true),
        (1.5, false),
        (-1.0, false),
    ] {
        let mut entry = rule("rank", range("A1", "A4"), "gt", "0");
        entry.rule_json = serde_json::json!({"kind":"top-bottom", "count":count,
            "direction":"top", "percent":percent, "format":{"bold":true}})
        .to_string();
        assert!(history
            .set_conditional_format_rule(&mut book, 0, 0, entry)
            .is_err());
    }
    assert_eq!(history.undo_count(), 0);
    assert!(book.snapshot_conditional_formats().is_empty());
}

#[test]
fn zero_or_small_percentages_can_match_nothing_and_full_percentage_matches_every_number() {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Number(2.0));
    book.set_cell(0, "A2", Value::Number(8.0));
    for bottom in [false, true] {
        for percent in [0, 1, 49] {
            install(&mut book, "A2", percent, true, bottom);
            assert!(!bold(&book, "A1"));
            assert!(!bold(&book, "A2"));
        }
        install(&mut book, "A2", 100, true, bottom);
        assert!(bold(&book, "A1"));
        assert!(bold(&book, "A2"));
    }
}
