use super::*;
use einfach_excel_core::shift::ShiftEdit;
use serde_json::json;

#[test]
fn visual_rules_restore_from_the_existing_file_snapshot_and_one_history_entry() {
    let mut book = numbers();
    let mut history = WorkbookHistory::default();
    let rule = entry("icons", json!({"kind":"icon-set", "iconSet":"three-arrows", "reverse":true,
        "showValue":false, "lowerThreshold":{"type":"percentile","value":"25"}}), 0);
    history.set_conditional_format_rule(&mut book, 0, 0, rule.clone()).unwrap();
    let display = book.snapshot_display_format_range(0, range("A1", "A1000")).unwrap();
    assert_eq!(history.undo_count(), 1);
    history.undo(&mut book).unwrap();
    assert!(book.snapshot_display_format_range(0, range("A1", "A1000")).unwrap().conditional_icons.is_empty());
    history.redo(&mut book).unwrap();
    assert_eq!(book.snapshot_display_format_range(0, range("A1", "A1000")).unwrap(), display);
    let mut restored = numbers();
    restored.restore_conditional_formats(book.snapshot_conditional_formats()).unwrap();
    assert_eq!(restored.snapshot_display_format_range(0, range("A1", "A1000")).unwrap(), display);
    assert_eq!(restored.conditional_format_config(0).unwrap().rules, [rule]);
}

#[test]
fn threshold_formula_references_move_with_structure_then_restore_atomically() {
    let mut book = numbers();
    book.set_cell(0, "B1", Value::Number(20.0));
    install(&mut book, scale(json!({"type":"formula","value":"=$B$1"})));
    let original = book.conditional_format_config(0).unwrap().rules;
    let mut history = WorkbookHistory::default();
    history.edit_structure(&mut book, 0, ShiftEdit::RowInsert { at: 0, count: 1 }).unwrap();
    let shifted = &book.conditional_format_config(0).unwrap().rules[0];
    let json: serde_json::Value = serde_json::from_str(&shifted.rule_json).unwrap();
    assert_eq!(json["maxThreshold"]["value"], "=$B$2");
    assert_eq!(color(&book, "A3").as_deref(), Some("#808080"));
    history.undo(&mut book).unwrap();
    assert_eq!(book.conditional_format_config(0).unwrap().rules, original);
    assert_eq!(color(&book, "A2").as_deref(), Some("#808080"));
}

#[test]
fn sheet_rename_rewrites_formula_thresholds_and_default_rules_remain_compatible() {
    let mut book = numbers();
    book.set_cell(0, "B1", Value::Number(20.0));
    install(&mut book, scale(json!({"type":"formula","value":"=Sheet1!$B$1"})));
    assert!(book.rename_sheet(0, "Renamed"));
    assert!(book.conditional_format_config(0).unwrap().rules[0].rule_json.contains("Renamed!$B$1"));
    assert_eq!(color(&book, "A2").as_deref(), Some("#808080"));
    install(&mut book, json!({"kind":"data-bar"}));
    assert_eq!(book.snapshot_display_format_range(0, range("A2", "A2")).unwrap().data_bars[0].1.width, 10.0);
}
