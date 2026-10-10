//! 规则 CRUD、单调修订号、失败原子性与行列结构历史的交叉验证。
#[path = "support/conditional_format_rule.rs"]
mod support;
use einfach_core::Value;
use einfach_excel_core::shift::ShiftEdit;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::Workbook;
use support::{range, rule};

#[test]
fn add_edit_remove_are_individual_history_entries_and_revisions_never_go_backwards() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    let original = rule("r", range("A1", "A100"), "gt", "10");
    history
        .set_conditional_format_rule(&mut book, 0, 0, original.clone())
        .unwrap();
    let edited = rule("r", range("A2", "A50"), "lt", "20");
    history
        .set_conditional_format_rule(&mut book, 0, 1, edited.clone())
        .unwrap();
    history
        .remove_conditional_format_rule(&mut book, 0, 2, "r")
        .unwrap();
    assert_eq!(history.undo_count(), 3);
    for (revision, expected) in [
        (4, vec![edited.clone()]),
        (5, vec![original.clone()]),
        (6, vec![]),
    ] {
        assert!(history.undo(&mut book).unwrap());
        let config = book.conditional_format_config(0).unwrap();
        assert_eq!(config.revision, revision);
        assert_eq!(config.rules, expected);
    }
    for expected in [vec![original], vec![edited], vec![]] {
        assert!(history.redo(&mut book).unwrap());
        assert_eq!(book.conditional_format_config(0).unwrap().rules, expected);
    }
    assert_eq!(book.conditional_format_config(0).unwrap().revision, 9);
}

#[test]
fn invalid_input_and_stale_writes_preserve_rules_and_redo() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    history
        .set_conditional_format_rule(&mut book, 0, 0, rule("r", range("A1", "A2"), "gt", "1"))
        .unwrap();
    history.undo(&mut book).unwrap();
    let before = book.conditional_format_config(0).unwrap();
    for bad in ["", "NaN", "inf", "=A1", "1,000"] {
        assert!(history
            .set_conditional_format_rule(
                &mut book,
                0,
                before.revision,
                rule("bad", range("A1", "A2"), "gt", bad)
            )
            .is_err());
    }
    let valid = rule("r", range("A1", "A2"), "gt", "1");
    assert!(history
        .set_conditional_format_rule(&mut book, 0, 0, valid)
        .is_err());
    assert!(history
        .remove_conditional_format_rule(&mut book, 0, before.revision, "missing")
        .is_err());
    assert_eq!(book.conditional_format_config(0).unwrap(), before);
    assert_eq!(history.redo_count(), 1);
    history.redo(&mut book).unwrap();
}

#[test]
fn invalid_formats_operators_and_ranges_cannot_write_partial_rules() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    let baseline = rule("r", range("A1", "A2"), "gt", "1");
    for patch in [
        serde_json::json!({"operator":"bogus"}),
        serde_json::json!({"kind":"formula"}),
        serde_json::json!({"format":{}}),
        serde_json::json!({"format":{"background":"red"}}),
        serde_json::json!({"format":{"height":50}}),
        serde_json::json!({"operator":"between"}),
        serde_json::json!({"operator":"between", "value2":"0"}),
        serde_json::json!({"value2":"2"}),
    ] {
        let mut entry = baseline.clone();
        let mut json: serde_json::Value = serde_json::from_str(&entry.rule_json).unwrap();
        for (key, value) in patch.as_object().unwrap() {
            json[key] = value.clone();
        }
        entry.rule_json = json.to_string();
        assert!(history
            .set_conditional_format_rule(&mut book, 0, 0, entry)
            .is_err());
    }
    let mut outside = baseline.clone();
    outside.row_end = 1_048_576;
    assert!(history
        .set_conditional_format_rule(&mut book, 0, 0, outside)
        .is_err());
    let mut reversed = baseline;
    reversed.row_start = 3;
    assert!(history
        .set_conditional_format_rule(&mut book, 0, 0, reversed)
        .is_err());
    assert_eq!(history.undo_count(), 0);
    assert_eq!(book.conditional_format_config(0).unwrap().revision, 0);
}

#[test]
fn exhausted_revision_rejects_set_remove_and_structure_before_any_mutation() {
    let mut book = Workbook::new();
    let entry = rule("r", range("A1", "A3"), "gt", "1");
    book.set_conditional_format_rule(0, 0, entry.clone())
        .unwrap();
    let mut snapshots = book.snapshot_conditional_formats();
    snapshots[0].revision = u64::MAX;
    book.restore_conditional_formats(snapshots.clone()).unwrap();
    book.set_cell(0, "A1", Value::Number(8.0));
    assert!(book
        .set_conditional_format_rule(0, u64::MAX, rule("r", range("B1", "B3"), "gt", "2"))
        .is_err());
    assert!(book
        .remove_conditional_format_rule(0, u64::MAX, "r")
        .is_err());
    assert!(book
        .try_structural_edit(0, ShiftEdit::RowInsert { at: 0, count: 1 })
        .is_err());
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(8.0));
    assert_eq!(book.snapshot_conditional_formats(), snapshots);
}

#[test]
fn rule_bounds_follow_row_and_column_insert_delete_and_history_restores_them() {
    for (edit, expected) in [
        (
            ShiftEdit::RowInsert { at: 1, count: 2 },
            Some(range("B4", "D6")),
        ),
        (
            ShiftEdit::RowInsert { at: 2, count: 2 },
            Some(range("B2", "D6")),
        ),
        (
            ShiftEdit::RowDelete { at: 1, count: 1 },
            Some(range("B2", "D3")),
        ),
        (ShiftEdit::RowDelete { at: 1, count: 3 }, None),
        (
            ShiftEdit::ColInsert { at: 2, count: 1 },
            Some(range("B2", "E4")),
        ),
        (
            ShiftEdit::ColDelete { at: 0, count: 2 },
            Some(range("A2", "B4")),
        ),
        (ShiftEdit::ColDelete { at: 1, count: 3 }, None),
    ] {
        let mut book = Workbook::new();
        let mut history = WorkbookHistory::default();
        let original = rule("r", range("B2", "D4"), "gt", "1");
        history
            .set_conditional_format_rule(&mut book, 0, 0, original.clone())
            .unwrap();
        history.edit_structure(&mut book, 0, edit).unwrap();
        let rules = book.conditional_format_config(0).unwrap().rules;
        if let Some(bounds) = expected {
            assert_eq!(rules, vec![rule("r", bounds, "gt", "1")], "{edit:?}");
        } else {
            assert!(rules.is_empty());
        }
        history.undo(&mut book).unwrap();
        assert_eq!(
            book.conditional_format_config(0).unwrap().rules,
            vec![original]
        );
        // 撤销结构后还能继续撤销原始规则，不因几何恢复产生第二条历史。
        history.undo(&mut book).unwrap();
        assert!(book.conditional_format_config(0).unwrap().rules.is_empty());
        history.redo(&mut book).unwrap();
        history.redo(&mut book).unwrap();
        assert_eq!(book.conditional_format_config(0).unwrap().rules, rules);
    }
}

#[test]
fn out_of_history_rule_change_is_not_overwritten_by_undo() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    history
        .set_conditional_format_rule(&mut book, 0, 0, rule("r", range("A1", "A2"), "gt", "1"))
        .unwrap();
    book.set_conditional_format_rule(0, 1, rule("other", range("B1", "B2"), "lt", "4"))
        .unwrap();
    let before = book.snapshot_conditional_formats();
    assert!(history.undo(&mut book).is_err());
    assert_eq!(book.snapshot_conditional_formats(), before);
    assert_eq!(history.undo_count(), 1);
}
