//! 条件格式事件使用真正变化规则的全部前后作用域，不夹带无关规则。
#[path = "support/conditional_format_rule.rs"]
mod support;
use einfach_excel_core::workbook::ConditionalFormatRuleAction;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellRange, Workbook};
use support::{range, rule};

fn assert_ranges(history: &WorkbookHistory, expected: &[CellRange]) {
    let fact = history.last_mutation().unwrap();
    assert_eq!(fact.changes.len(), 1);
    let actual = &fact.changes[0].1;
    assert_eq!(actual.len(), expected.len());
    for range in expected { assert!(actual.contains(range), "missing {range:?}"); }
    assert!(!actual.contains(&range("Z900", "Z901")));
}

#[test]
fn multi_region_create_disable_scope_move_delete_and_replay_report_all_changed_ranges() {
    let mut book = Workbook::new();
    book.set_conditional_format_rule(0, 0, rule("untouched", range("Z900", "Z901"), "gt", "1")).unwrap();
    let mut history = WorkbookHistory::default();
    let mut original = rule("multi", range("A1", "A2"), "gt", "1");
    original.additional_ranges = vec![range("J30", "J31")];
    history.set_conditional_format_rule(&mut book, 0, 1, original.clone()).unwrap();
    let old = [range("A1", "A2"), range("J30", "J31")];
    assert_ranges(&history, &old);
    history.undo(&mut book).unwrap(); assert_ranges(&history, &old);
    history.redo(&mut book).unwrap(); assert_ranges(&history, &old);
    let revision = book.conditional_format_config(0).unwrap().revision;
    history.manage_conditional_format_rule(&mut book, 0, revision, "multi", ConditionalFormatRuleAction::Disable).unwrap();
    assert_ranges(&history, &old);
    history.undo(&mut book).unwrap(); assert_ranges(&history, &old);
    history.redo(&mut book).unwrap(); assert_ranges(&history, &old);
    original.row_start = 49; original.row_end = 50;
    original.additional_ranges = vec![range("N70", "N71")];
    let revision = book.conditional_format_config(0).unwrap().revision;
    history.set_conditional_format_rule(&mut book, 0, revision, original).unwrap();
    let moved = [old[0], old[1], range("A50", "A51"), range("N70", "N71")];
    assert_ranges(&history, &moved);
    history.undo(&mut book).unwrap(); assert_ranges(&history, &moved);
    history.redo(&mut book).unwrap(); assert_ranges(&history, &moved);
    let revision = book.conditional_format_config(0).unwrap().revision;
    history.remove_conditional_format_rule(&mut book, 0, revision, "multi").unwrap();
    let new = [range("A50", "A51"), range("N70", "N71")];
    assert_ranges(&history, &new);
    history.undo(&mut book).unwrap(); assert_ranges(&history, &new);
    history.redo(&mut book).unwrap(); assert_ranges(&history, &new);
}
