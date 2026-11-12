//! Mean rules use the full sparse numeric domain, independently of visible windows.
#[path = "support/conditional_format_rule.rs"]
mod support;
use einfach_core::Value;
use einfach_excel_core::{Workbook, workbook_history::WorkbookHistory};
use serde_json::json;
use support::{range, rule};

fn install(book: &mut Workbook, end: &str, below: bool, equal: bool) {
    let mut entry = rule("mean", range("A1", end), "gt", "0");
    entry.rule_json = json!({"kind":"above-average", "direction":if below {"below"} else {"above"},
        "equalAverage":equal, "format":{"bold":true}}).to_string();
    let revision = book.conditional_format_config(0).unwrap().revision;
    book.set_conditional_format_rule(0, revision, entry).unwrap();
}
fn bold(book: &Workbook, address: &str) -> bool {
    book.snapshot_display_format_range(0, range(address, address)).unwrap().formats.cell_styles
        .iter().any(|(_, style)| style.bold == Some(true))
}

#[test]
fn zero_negatives_formulas_and_offscreen_values_count_but_other_scalars_do_not() {
    let mut book = Workbook::new();
    for (addr, number) in [("A1", -10.), ("A2", 0.), ("A3", 10.), ("A999", 20.)] {
        book.set_cell(0, addr, Value::Number(number));
    }
    book.set_formula(0, "A4", "=A999");
    book.set_cell(0, "A5", Value::Text("999".into()));
    book.set_cell(0, "A6", Value::Boolean(true));
    book.set_formula(0, "A7", "=1/0");
    book.set_formula(0, "A8", "=\"\"");
    install(&mut book, "A1048576", false, false); // mean = 8
    for row in 1..=9 { assert_eq!(bold(&book, &format!("A{row}")), [3, 4].contains(&row)); }
    assert!(bold(&book, "A999"));
    install(&mut book, "A1048576", true, false);
    assert!(bold(&book, "A1"));
    assert!(bold(&book, "A2"));
    assert!(!bold(&book, "A3"));
    assert!(!bold(&book, "A7"));
    assert!(book.sheet(0).unwrap().snapshot_format_range(range("A1", "A9")).cell_styles.is_empty());
}

#[test]
fn disjoint_regions_exclude_gaps_and_invalidate_when_formula_dependencies_change() {
    let mut book = Workbook::new();
    for (addr, value) in [("A1", 0.), ("A2", 8.), ("B1", -9999.), ("Z1", 20.)] {
        book.set_cell(0, addr, Value::Number(value));
    }
    book.set_formula(0, "C1", "=Z1");
    let mut entry = rule("mean", range("A1", "A2"), "gt", "0");
    entry.additional_ranges = vec![range("C1", "C1000")];
    entry.rule_json = json!({"kind":"above-average", "direction":"above",
        "format":{"bold":true}}).to_string();
    let mut history = WorkbookHistory::default();
    history.set_conditional_format_rule(&mut book, 0, 0, entry).unwrap();
    assert!(!bold(&book, "A2"));
    assert!(bold(&book, "C1"));
    let reads = book.sheet(0).unwrap().debug_recompute_count();
    for _ in 0..10 { assert!(!bold(&book, "A2")); }
    book.set_cell(0, "B1", Value::Number(9999.));
    assert!(!bold(&book, "A2"));
    assert!(!bold(&book, "B1"));
    assert_eq!(book.sheet(0).unwrap().debug_recompute_count(), reads);
    book.set_cell(0, "Z1", Value::Number(4.));
    assert!(bold(&book, "A2"));
    book.set_cell(0, "C999", Value::Number(100.));
    assert!(!bold(&book, "A2"));
    book.clear_range(0, range("C999", "C999"));
    assert!(bold(&book, "A2"));
    history.undo(&mut book).unwrap();
    assert!(!bold(&book, "A2"));
    history.redo(&mut book).unwrap();
    assert!(bold(&book, "A2"));
}

#[test]
fn empty_single_and_equal_boundaries_work_in_both_directions() {
    let mut book = Workbook::new();
    for below in [false, true] {
        for equal in [false, true] {
            install(&mut book, "A3", below, equal);
            assert!(!bold(&book, "A1"));
            book.set_cell(0, "A1", Value::Number(-8.));
            assert_eq!(bold(&book, "A1"), equal);
            book.clear_range(0, range("A1", "A3"));
        }
    }
    for (i, n) in [0.25, 0.5, 0.75].into_iter().enumerate() {
        book.set_cell(0, &format!("A{}", i + 1), Value::Number(n));
    }
    for below in [false, true] {
        for equal in [false, true] {
            install(&mut book, "A3", below, equal);
            assert_eq!(bold(&book, "A1"), below);
            assert_eq!(bold(&book, "A2"), equal);
            assert_eq!(bold(&book, "A3"), !below);
        }
    }
}

#[test]
fn finite_extremes_do_not_overflow_and_compensation_retains_cancellation_terms() {
    let mut book = Workbook::new();
    for (i, n) in [1e308, 1e308, 1.2e308].into_iter().enumerate() {
        book.set_cell(0, &format!("A{}", i + 1), Value::Number(n));
    }
    install(&mut book, "A3", false, false);
    assert!(!bold(&book, "A1"));
    assert!(bold(&book, "A3"));
    for (i, n) in [1e308, 1., -1e308, 0.25].into_iter().enumerate() {
        book.set_cell(0, &format!("A{}", i + 1), Value::Number(n));
    }
    install(&mut book, "A4", false, false); // true mean is .3125, not .0625
    assert!(bold(&book, "A2"));
    assert!(!bold(&book, "A4"));
}

#[test]
fn invalid_rule_preserves_revision_history_and_atom_ownership() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    let before = book.conditional_format_config(0).unwrap();
    let atoms = book.sheet(0).unwrap().debug_total_atom_count();
    for patch in [json!({"direction":"top"}), json!({"equalAverage":1}),
        json!({"equalAverage":null}), json!({"stdDev":1}), json!({"format":null})] {
        let mut value = json!({"kind":"above-average", "direction":"above", "format":{"bold":true}});
        value.as_object_mut().unwrap().extend(patch.as_object().unwrap().clone());
        let mut entry = rule("bad", range("A1", "A4"), "gt", "0");
        entry.rule_json = value.to_string();
        assert!(history.set_conditional_format_rule(&mut book, 0, 0, entry).is_err());
        assert_eq!(book.conditional_format_config(0).unwrap(), before);
    }
    assert_eq!(book.sheet(0).unwrap().debug_total_atom_count(), atoms);
    assert_eq!(history.undo_count(), 0);
}
