#[path = "support/conditional_format_rule.rs"]
mod support;
use einfach_core::Value;
use einfach_excel_core::{Workbook, workbook_history::WorkbookHistory};
use serde_json::json;
use support::{range, rule};

fn install(book: &mut Workbook, history: &mut WorkbookHistory, condition: &str, start: &str, end: &str) {
    let mut entry = rule("state", range(start, end), "gt", "0");
    entry.rule_json = json!({"kind":"cell-state", "condition":condition,
        "stopIfTrue":true, "format":{"bold":true}}).to_string();
    let revision = book.conditional_format_config(0).unwrap().revision;
    history.set_conditional_format_rule(book, 0, revision, entry).unwrap();
}
fn bold(book: &Workbook, address: &str) -> bool {
    book.snapshot_display_format_range(0, range(address, address)).unwrap().formats.cell_styles
        .iter().any(|(_, style)| style.bold == Some(true))
}

#[test]
fn four_conditions_classify_native_scalars_without_unicode_trimming_or_error_text_coercion() {
    let mut book = Workbook::new();
    book.set_cell(0, "A2", Value::Text("".into()));
    book.set_formula(0, "A3", "=\"\"");
    book.set_cell(0, "A4", Value::Text("   ".into()));
    book.set_formula(0, "A5", "=1/0");
    book.set_cell(0, "A6", Value::Text("#DIV/0!".into()));
    book.set_cell(0, "A7", Value::Number(0.));
    book.set_cell(0, "A8", Value::Boolean(true));
    book.set_cell(0, "A9", Value::Text("\t".into()));
    book.set_cell(0, "A10", Value::Text("\u{a0}".into()));
    book.set_formula(0, "A11", "=NA()");
    book.set_cell(0, "A12", Value::Text("Text".into()));
    book.set_cell(0, "A13", Value::Text("\n".into()));
    book.set_cell(0, "A14", Value::Text("\u{3000}".into()));
    let base = book.sheet(0).unwrap().snapshot_format_range(range("A1", "B14"));
    for condition in ["blank", "not-blank", "error", "not-error"] {
        let mut history = WorkbookHistory::default();
        install(&mut book, &mut history, condition, "A1", "A14");
        for row in 1..=14 {
            let expected = match condition {
                "blank" => row <= 4,
                "not-blank" => row > 4 && row != 5 && row != 11,
                "error" => row == 5 || row == 11,
                _ => row != 5 && row != 11,
            };
            assert_eq!(bold(&book, &format!("A{row}")), expected, "{condition} A{row}");
        }
        assert!(!bold(&book, "B1"));
        assert_eq!(book.sheet(0).unwrap().snapshot_format_range(range("A1", "B14")), base);
    }
    assert!(matches!(book.get_cell("Sheet1", "A5"), Value::Error(_)));
    assert_eq!(book.get_cell("Sheet1", "A6"), Value::Text("#DIV/0!".into()));
}

#[test]
fn absent_cells_paint_within_bounded_scope_and_undo_without_creating_cell_values() {
    let mut book = Workbook::new();
    let before = book.snapshot_display_format_range(0, range("A1", "E5")).unwrap();
    let mut history = WorkbookHistory::default();
    install(&mut book, &mut history, "blank", "B2", "D4");
    let after = book.snapshot_display_format_range(0, range("A1", "E5")).unwrap();
    assert_eq!(after.formats.cell_styles.len(), 9);
    assert_eq!(book.get_cell("Sheet1", "B2"), Value::Null);
    assert!(book.sheet(0).unwrap().snapshot_format_range(range("A1", "E5")).cell_styles.is_empty());
    history.undo(&mut book).unwrap();
    assert_eq!(book.snapshot_display_format_range(0, range("A1", "E5")).unwrap(), before);
    history.redo(&mut book).unwrap();
    assert_eq!(book.snapshot_display_format_range(0, range("A1", "E5")).unwrap(), after);
}

#[test]
fn formula_dependencies_switch_between_empty_error_and_numeric_without_rewriting_the_rule() {
    let mut book = Workbook::new();
    book.set_cell(0, "Z1", Value::Number(0.));
    book.set_formula(0, "A1", "=IF(Z1=0,\"\",1/Z1)");
    let mut history = WorkbookHistory::default();
    install(&mut book, &mut history, "blank", "A1", "A1");
    assert!(bold(&book, "A1"));
    book.set_cell(0, "Z1", Value::Number(2.));
    assert!(!bold(&book, "A1"));
    book.set_formula(0, "A1", "=1/Z1");
    book.set_cell(0, "Z1", Value::Number(0.));
    assert!(!bold(&book, "A1"));
    install(&mut book, &mut history, "not-blank", "A1", "A1");
    assert!(!bold(&book, "A1"));
    install(&mut book, &mut history, "error", "A1", "A1");
    assert!(bold(&book, "A1"));
    book.set_cell(0, "Z1", Value::Number(4.));
    assert!(!bold(&book, "A1"));
}

#[test]
fn spilled_anchor_and_children_follow_the_existing_scalar_projection() {
    let mut book = Workbook::new();
    book.set_formula(0, "A1", "=SEQUENCE(2)");
    let mut history = WorkbookHistory::default();
    install(&mut book, &mut history, "not-blank", "A1", "A3");
    assert!(bold(&book, "A1"));
    assert!(bold(&book, "A2"));
    assert!(!bold(&book, "A3"));
}

#[test]
fn invalid_conditions_and_unknown_fields_reject_without_catalog_or_history_changes() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    let before = book.conditional_format_config(0).unwrap();
    for patch in [json!({"condition":"non-blank"}), json!({"condition":null}),
        json!({"condition":1}), json!({"text":"x"}), json!({"format":null})] {
        let mut body = json!({"kind":"cell-state", "condition":"blank", "format":{"bold":true}});
        body.as_object_mut().unwrap().extend(patch.as_object().unwrap().clone());
        let mut entry = rule("bad", range("A1", "A3"), "gt", "0");
        entry.rule_json = body.to_string();
        assert!(history.set_conditional_format_rule(&mut book, 0, 0, entry).is_err());
        assert_eq!(book.conditional_format_config(0).unwrap(), before);
    }
    assert_eq!(history.undo_count(), 0);
}
