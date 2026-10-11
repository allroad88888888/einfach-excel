//! 改名、删表及历史重放不能把条件公式引用永久丢掉。
#[path = "support/conditional_format_rule.rs"]
mod support;
use einfach_core::Value;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::Workbook;
use support::{range, rule};

fn install(book: &mut Workbook, id: &str, formula: &str) {
    let mut entry = rule(id, range("A1", "A2"), "gt", "0");
    entry.rule_json = serde_json::json!({"kind":"formula", "formula":formula,
        "format":{"bold":true}})
    .to_string();
    let revision = book.conditional_format_config(0).unwrap().revision;
    book.set_conditional_format_rule(0, revision, entry)
        .unwrap();
}

fn bold(book: &Workbook) -> bool {
    book.snapshot_display_format_range(0, range("A1", "A1"))
        .unwrap().formats
        .cell_styles
        .iter()
        .any(|(_, style)| style.bold == Some(true))
}

#[test]
fn rename_follows_references_and_undo_restores_even_previous_dangling_references() {
    let mut book = Workbook::new();
    book.add_sheet("Old");
    book.set_cell(1, "A1", Value::Number(7.0));
    install(&mut book, "live", "=Old!$A$1>5");
    install(&mut book, "dangling", "='New Name'!$A$1>5");
    let before = book.conditional_format_config(0).unwrap();
    let mut history = WorkbookHistory::default();
    history.edit_sheet(&mut book, Some(1), "New Name").unwrap();
    let after = book.conditional_format_config(0).unwrap();
    assert!(after.rules[0].rule_json.contains("New Name"));
    assert_eq!(after.revision, before.revision + 1);
    assert!(bold(&book));
    history.undo(&mut book).unwrap();
    let restored = book.conditional_format_config(0).unwrap();
    assert_eq!(restored.rules, before.rules);
    assert_eq!(restored.revision, after.revision + 1);
    history.redo(&mut book).unwrap();
    assert_eq!(
        book.conditional_format_config(0).unwrap().rules,
        after.rules
    );
}

#[test]
fn deleting_and_restoring_sheet_recovers_original_conditional_formula() {
    let mut book = Workbook::new();
    book.add_sheet("Other");
    book.set_cell(1, "A1", Value::Number(7.0));
    install(&mut book, "r", "=Other!A1>5");
    let before = book.conditional_format_config(0).unwrap().rules;
    let mut history = WorkbookHistory::default();
    assert!(bold(&book));
    history.remove_sheet(&mut book, 1).unwrap();
    assert!(book.conditional_format_config(0).unwrap().rules[0]
        .rule_json
        .contains("#REF!"));
    assert!(!bold(&book));
    history.undo(&mut book).unwrap();
    assert_eq!(book.conditional_format_config(0).unwrap().rules, before);
    assert!(bold(&book));
    history.redo(&mut book).unwrap();
    assert!(!bold(&book));
}

#[test]
fn undo_new_sheet_keeps_the_original_dangling_reference_without_extra_revision() {
    let mut book = Workbook::new();
    install(&mut book, "r", "=Future!A1>5");
    let before = book.conditional_format_config(0).unwrap();
    let mut history = WorkbookHistory::default();
    history.edit_sheet(&mut book, None, "Future").unwrap();
    history.undo(&mut book).unwrap();
    assert_eq!(book.conditional_format_config(0).unwrap(), before);
    history.redo(&mut book).unwrap();
    assert_eq!(book.conditional_format_config(0).unwrap(), before);
}

#[test]
fn revision_exhaustion_rejects_rename_and_delete_before_topology_changes() {
    let mut book = Workbook::new();
    book.add_sheet("Other");
    install(&mut book, "r", "=Other!A1>5");
    let mut configs = book.snapshot_conditional_formats();
    configs[0].revision = u64::MAX;
    book.restore_conditional_formats(configs.clone()).unwrap();
    assert!(!book.rename_sheet(1, "New"));
    assert!(book.remove_sheet(1).is_none());
    assert_eq!(book.name(1), Some("Other"));
    assert_eq!(book.snapshot_conditional_formats(), configs);
}

#[test]
fn restore_rejects_exhausted_survivor_revision_without_consuming_the_archive() {
    let mut book = Workbook::new();
    book.add_sheet("Other");
    install(&mut book, "r", "=Other!A1>5");
    let mut history = WorkbookHistory::default();
    history.remove_sheet(&mut book, 1).unwrap();
    let saved = book.snapshot_conditional_formats();
    let mut exhausted = saved.clone();
    exhausted[0].revision = u64::MAX;
    book.restore_conditional_formats(exhausted.clone()).unwrap();
    assert!(history.undo(&mut book).is_err());
    assert_eq!(book.sheet_count(), 1);
    assert_eq!(book.snapshot_conditional_formats(), exhausted);
    book.restore_conditional_formats(saved).unwrap();
    history.undo(&mut book).unwrap();
    assert_eq!(book.sheet_count(), 2);
    assert!(!book.conditional_format_config(0).unwrap().rules[0]
        .rule_json
        .contains("#REF!"));
}
