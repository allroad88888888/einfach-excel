//! 规则管理只写元数据，一次操作一次撤销；失败不能改规则或丢掉 redo。
#[path = "support/conditional_format_rule.rs"]
mod support;
use einfach_core::Value;
use einfach_excel_core::workbook::ConditionalFormatRuleAction::{self, *};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::Workbook;
use support::{range, rule};

fn setup() -> (Workbook, WorkbookHistory) {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Number(8.0));
    book.set_conditional_format_rule(0, 0, rule("r", range("A1", "A3"), "gt", "1")).unwrap();
    (book, WorkbookHistory::default())
}

fn manage(book: &mut Workbook, history: &mut WorkbookHistory, id: &str, action: ConditionalFormatRuleAction) {
    let revision = book.conditional_format_config(0).unwrap().revision;
    history.manage_conditional_format_rule(book, 0, revision, id, action).unwrap();
}

#[test]
fn disable_enable_change_only_display_and_each_undo_restores_the_previous_state() {
    let (mut book, mut history) = setup();
    let before = book.conditional_format_config(0).unwrap();
    let base = book.sheet(0).unwrap().snapshot_format_range(range("A1", "A3"));
    assert_eq!(book.snapshot_display_format_range(0, range("A1", "A3")).unwrap().cell_styles.len(), 1);
    manage(&mut book, &mut history, "r", Disable);
    assert!(book.snapshot_display_format_range(0, range("A1", "A3")).unwrap().cell_styles.is_empty());
    assert_eq!(book.sheet(0).unwrap().snapshot_format_range(range("A1", "A3")), base);
    manage(&mut book, &mut history, "r", Enable);
    assert_eq!(history.undo_count(), 2);
    history.undo(&mut book).unwrap();
    assert!(book.snapshot_display_format_range(0, range("A1", "A3")).unwrap().cell_styles.is_empty());
    history.undo(&mut book).unwrap();
    assert_eq!(book.conditional_format_config(0).unwrap().rules, before.rules);
    history.redo(&mut book).unwrap();
    history.redo(&mut book).unwrap();
    assert_eq!(book.snapshot_display_format_range(0, range("A1", "A3")).unwrap().cell_styles.len(), 1);
}

#[test]
fn copy_keeps_disabled_state_and_has_an_independent_id_and_one_history_entry() {
    let (mut book, mut history) = setup();
    manage(&mut book, &mut history, "r", Disable);
    let before = book.conditional_format_config(0).unwrap();
    manage(&mut book, &mut history, "r", Duplicate);
    let after = book.conditional_format_config(0).unwrap();
    assert_eq!(after.revision, before.revision + 1);
    assert_eq!(after.rules.len(), 2);
    assert_ne!(after.rules[0].id, after.rules[1].id);
    assert_eq!(after.rules[0].rule_json, after.rules[1].rule_json);
    assert_eq!(after.rules[1].row_end, 2);
    assert_eq!(history.undo_count(), 2);
    history.undo(&mut book).unwrap();
    assert_eq!(book.conditional_format_config(0).unwrap().rules, before.rules);
    history.redo(&mut book).unwrap();
    assert_eq!(book.conditional_format_config(0).unwrap().rules, after.rules);
    manage(&mut book, &mut history, &after.rules[1].id, Enable);
    let current = book.conditional_format_config(0).unwrap();
    assert_eq!(current.rules[0].rule_json, before.rules[0].rule_json);
    assert_ne!(current.rules[0].rule_json, current.rules[1].rule_json);
}

#[test]
fn moving_tied_and_extreme_priorities_changes_the_winner_atomically_and_undo_restores_exact_metadata() {
    for priorities in [(0, 0), (i64::MIN, i64::MAX)] {
        let (mut book, mut history) = setup();
        let mut first = rule("r", range("A1", "A3"), "gt", "1");
        first.priority = priorities.0;
        book.set_conditional_format_rule(0, 1, first).unwrap();
        let mut second = rule("blue", range("A1", "A3"), "gt", "1");
        second.priority = priorities.1;
        second.rule_json = second.rule_json.replace("#FFC7CE", "#0000FF");
        book.set_conditional_format_rule(0, 2, second).unwrap();
        let before = book.conditional_format_config(0).unwrap();
        manage(&mut book, &mut history, "blue", MoveUp);
        let after = book.conditional_format_config(0).unwrap();
        assert_eq!(after.revision, before.revision + 1);
        assert_eq!(after.rules[0].id, "blue");
        assert_eq!(history.undo_count(), 1);
        let display = book.snapshot_display_format_range(0, range("A1", "A3")).unwrap();
        assert_eq!(display.cell_styles[0].1.background, Some(Some("#0000FF".into())));
        history.undo(&mut book).unwrap();
        assert_eq!(book.conditional_format_config(0).unwrap().rules, before.rules);
        history.redo(&mut book).unwrap();
        assert_eq!(book.conditional_format_config(0).unwrap().rules, after.rules);
        manage(&mut book, &mut history, "blue", MoveDown);
        assert_eq!(book.conditional_format_config(0).unwrap().rules[0].id, "r");
    }
}

#[test]
fn boundary_moves_and_same_enabled_state_are_true_noops_and_preserve_redo() {
    let (mut book, mut history) = setup();
    manage(&mut book, &mut history, "r", Disable);
    history.undo(&mut book).unwrap();
    let before = book.conditional_format_config(0).unwrap();
    for action in [MoveUp, MoveDown, Enable] {
        manage(&mut book, &mut history, "r", action);
        assert_eq!(book.conditional_format_config(0).unwrap(), before);
        assert_eq!(history.redo_count(), 1);
        assert_eq!(history.undo_count(), 0);
    }
}

#[test]
fn stale_missing_and_revision_exhaustion_fail_before_mutation() {
    let (mut book, mut history) = setup();
    manage(&mut book, &mut history, "r", Duplicate);
    history.undo(&mut book).unwrap();
    let before = book.conditional_format_config(0).unwrap();
    for action in [Duplicate, Enable, Disable, MoveUp, MoveDown] {
        assert!(history.manage_conditional_format_rule(&mut book, 0, 0, "r", action).is_err());
        assert!(history.manage_conditional_format_rule(&mut book, 0, before.revision, "missing", action).is_err());
    }
    assert_eq!(book.conditional_format_config(0).unwrap(), before);
    assert_eq!(history.redo_count(), 1);
    let mut snapshots = book.snapshot_conditional_formats();
    snapshots[0].revision = u64::MAX;
    book.restore_conditional_formats(snapshots.clone()).unwrap();
    for action in [Duplicate, Disable] {
        assert!(history.manage_conditional_format_rule(&mut book, 0, u64::MAX, "r", action).is_err());
        assert_eq!(book.snapshot_conditional_formats(), snapshots);
    }
    assert_eq!(history.redo_count(), 1);
}

#[test]
fn copy_skips_existing_ids_and_does_not_reinterpret_legacy_rule_payloads() {
    let (mut book, mut history) = setup();
    let mut legacy = rule("conditional-format-3", range("C1", "C2"), "gt", "1");
    legacy.rule_json = r#"{"kind":"formula","formula":"=A1>1","extension":"keep"}"#.into();
    book.set_conditional_format_rule(0, 1, legacy.clone()).unwrap();
    manage(&mut book, &mut history, "r", Duplicate);
    let config = book.conditional_format_config(0).unwrap();
    assert_eq!(config.rules[1].id, "conditional-format-4");
    assert_eq!(config.rules[2].rule_json, legacy.rule_json);
    for action in [Duplicate, Enable, Disable] {
        assert!(history.manage_conditional_format_rule(&mut book, 0, config.revision, &legacy.id, action).is_err());
        assert_eq!(book.conditional_format_config(0).unwrap(), config);
    }
    // 未支持的条件仍可改变目录顺序，但不能被解析成假的数值规则。
    manage(&mut book, &mut history, &legacy.id, MoveUp);
    let moved = book.conditional_format_config(0).unwrap();
    assert_eq!(moved.rules[1].rule_json, legacy.rule_json);
}

#[test]
fn malformed_enabled_values_are_rejected_without_changing_rules_or_history() {
    let (mut book, mut history) = setup();
    let before = book.conditional_format_config(0).unwrap();
    for enabled in [serde_json::json!("false"), serde_json::json!(0), serde_json::Value::Null] {
        let mut invalid = before.rules[0].clone();
        let mut json: serde_json::Value = serde_json::from_str(&invalid.rule_json).unwrap();
        json["enabled"] = enabled;
        invalid.rule_json = json.to_string();
        assert!(history.set_conditional_format_rule(&mut book, 0, before.revision, invalid).is_err());
        assert_eq!(book.conditional_format_config(0).unwrap(), before);
    }
    assert_eq!(history.undo_count(), 0);
}
