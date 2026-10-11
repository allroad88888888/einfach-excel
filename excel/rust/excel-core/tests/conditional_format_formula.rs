//! 公式条件的相对原点、错误结果、跨表计算与原生历史。
#[path = "support/conditional_format_rule.rs"]
mod support;
use einfach_core::Value;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::Workbook;
use support::{range, rule};

fn install(book: &mut Workbook, bounds: (&str, &str), formula: &str) {
    let mut entry = rule("formula", range(bounds.0, bounds.1), "gt", "0");
    entry.rule_json = serde_json::json!({"kind":"formula", "formula":formula,
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
fn relative_and_mixed_references_are_anchored_to_the_rule_not_the_viewport() {
    let mut book = Workbook::new();
    book.set_cell(0, "A2", Value::Number(2.0));
    book.set_cell(0, "A3", Value::Number(8.0));
    book.set_cell(0, "E1", Value::Number(5.0));
    install(&mut book, ("B2", "C3"), "=$A2>$E$1");
    assert!(!bold(&book, "B2"));
    assert!(!bold(&book, "C2"));
    // Read only the bottom-right cell: no viewport-origin rebasing.
    assert!(bold(&book, "C3"));
    assert!(bold(&book, "B3"));
    assert!(book
        .sheet(0)
        .unwrap()
        .snapshot_format_range(range("B2", "C3"))
        .cell_styles
        .is_empty());
    book.set_cell(0, "A3", Value::Number(1.0));
    assert!(!bold(&book, "C3"));
}

#[test]
fn plain_relative_references_move_in_both_axes() {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Number(2.0));
    book.set_cell(0, "B2", Value::Number(9.0));
    install(&mut book, ("B2", "C3"), "=A1>5");
    assert!(!bold(&book, "B2"));
    assert!(bold(&book, "C3"));
}

#[test]
fn formula_can_highlight_blank_or_text_cells_and_use_current_row_column() {
    let mut book = Workbook::new();
    book.set_cell(0, "B3", Value::Text("label".into()));
    install(&mut book, ("B2", "C3"), "=AND(ROW()=3,COLUMN()=2)");
    assert!(bold(&book, "B3"));
    assert!(!bold(&book, "C3"));
    assert!(!bold(&book, "B2"));
}

#[test]
fn cross_sheet_formula_recalculates_after_dependency_edits() {
    let mut book = Workbook::new();
    let other = book.add_sheet("Other Data");
    book.set_cell(other, "A1", Value::Number(6.0));
    book.set_formula(other, "B1", "=A1*2");
    install(&mut book, ("A1", "A2"), "='Other Data'!$B$1>10");
    assert!(bold(&book, "A2"));
    book.set_cell(other, "A1", Value::Number(1.0));
    assert!(!bold(&book, "A2"));
}

#[test]
fn errors_are_false_unless_formula_handles_them_and_numeric_truth_is_supported() {
    let mut book = Workbook::new();
    for (formula, expected) in [
        ("=1/0", false),
        ("=IFERROR(1/0,TRUE)", true),
        ("=0", false),
        ("=-2", true),
        ("=\"TRUE\"", false),
        ("=FALSE", false),
    ] {
        install(&mut book, ("A1", "A1"), formula);
        assert_eq!(bold(&book, "A1"), expected, "{formula}");
    }
}

#[test]
fn invalid_formula_does_not_create_history_or_change_rules() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    for formula in ["", "=", "=SUM(", "=1+"] {
        let mut entry = rule("bad", range("A1", "A2"), "gt", "0");
        entry.rule_json = serde_json::json!({"kind":"formula", "formula":formula,
            "format":{"bold":true}})
        .to_string();
        assert!(history
            .set_conditional_format_rule(&mut book, 0, 0, entry)
            .is_err());
    }
    assert_eq!(history.undo_count(), 0);
    assert!(book.snapshot_conditional_formats().is_empty());
}
