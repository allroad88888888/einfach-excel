//! 删除表的真实跨表源码/规则变动在 archive 被取走后仍能用于 undo 事实。
#[path = "support/conditional_format_rule.rs"]
mod support;
use einfach_excel_core::data_validation::{DataValidationKind, DataValidationRule};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, Workbook};
use support::{range, rule};

#[test]
fn delete_undo_redo_keep_stable_cross_sheet_formula_rule_and_validation_positions() {
    let mut book = Workbook::new();
    book.add_sheet("Audit");
    book.add_sheet("Untouched");
    book.set_formula(1, "J30", "=Sheet1!A1");
    let audit_key = book.sheet_key(1).unwrap();
    let removed_key = book.sheet_key(0).unwrap();
    let untouched_key = book.sheet_key(2).unwrap();
    let mut referring = rule("reference", range("B5", "B6"), "gt", "1");
    referring.additional_ranges = vec![range("K30", "K31")];
    referring.rule_json = serde_json::json!({ "kind":"formula", "formula":"=Sheet1!A1>0",
        "format":{"bold":true} }).to_string();
    book.set_conditional_format_rule(1, 0, referring).unwrap();
    book.set_conditional_format_rule(1, 1, rule("unrelated", range("Z900", "Z901"), "gt", "1")).unwrap();
    book.sheet_mut(1).unwrap().set_data_validation(range("D9", "D10"), Some(DataValidationRule {
        kind: DataValidationKind::CustomFormula { formula: "=Sheet1!A1>0".into(),
            anchor: CellAddress::parse("D9").unwrap() },
        ignore_blank: false, operator: Default::default(), options: Default::default(),
    })).unwrap();
    let mut history = WorkbookHistory::default();
    history.remove_sheet(&mut book, 0).unwrap();
    assert_eq!(book.sheet(0).unwrap().formula_text_at(CellAddress::parse("J30").unwrap()).as_deref(), Some("=#REF!"));
    let expected = history.last_mutation().unwrap().changes.clone();
    assert_eq!(expected.len(), 2);
    assert!(expected.iter().any(|(key, ranges)| *key == removed_key && ranges.is_empty()));
    assert!(!expected.iter().any(|(key, _)| *key == untouched_key));
    let audit = &expected.iter().find(|(key, _)| *key == audit_key).unwrap().1;
    for target in [range("J30", "J30"), range("B5", "B6"), range("K30", "K31"), range("D9", "D10")] {
        assert!(audit.contains(&target), "missing {target:?}");
    }
    assert!(!audit.contains(&range("Z900", "Z901")));
    assert_eq!(history.mutation_sequence(), 1);
    history.undo(&mut book).unwrap();
    assert_eq!(book.sheet(1).unwrap().formula_text_at(CellAddress::parse("J30").unwrap()).as_deref(), Some("=Sheet1!A1"));
    // restore 已消费 archive；事实不能只从仍为 Some 的 archive 临时读取。
    assert_eq!(history.last_mutation().unwrap().changes, expected);
    assert_eq!(history.mutation_sequence(), 2);
    history.redo(&mut book).unwrap();
    assert_eq!(history.last_mutation().unwrap().changes, expected);
    assert_eq!(history.mutation_sequence(), 3);
}

#[test]
fn template_only_delete_changes_report_metadata_without_inventing_origin_cell_ranges() {
    use einfach_core::Value;
    let mut book = Workbook::new();
    book.add_sheet("Report");
    for (addr, text) in [("A1", "Amount"), ("B1", "Total")] {
        book.set_cell(1, addr, Value::Text(text.into()));
    }
    book.define_table(Some("Orders"), 1, range("A1", "B3"), true).unwrap();
    let key = book.sheet_key(1).unwrap();
    let mut history = WorkbookHistory::default();
    history.set_cell_input(&mut book, 1, "B2", "=Sheet1!A1+[@Amount]").unwrap();
    // 手工例外不删除计算列模板；此时没有可冒充模板的实际公式格。
    book.set_cell(1, "B2", Value::Number(5.));
    book.set_cell(1, "B3", Value::Number(6.));
    history.clear("");
    history.remove_sheet(&mut book, 0).unwrap();
    let expected = history.last_mutation().unwrap().changes.clone();
    assert_eq!(expected.iter().find(|(current, _)| *current == key).unwrap().1, Vec::new());
    assert!(book.get_table("Orders").unwrap().calculated_columns()[1].as_ref().unwrap().formula().contains("#REF!"));
    history.undo(&mut book).unwrap();
    assert_eq!(history.last_mutation().unwrap().changes, expected);
    history.redo(&mut book).unwrap();
    assert_eq!(history.last_mutation().unwrap().changes, expected);
}
