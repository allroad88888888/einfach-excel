//! Names and custom formulas are workbook metadata, as in Excel: protected sheets do not lock them.
use super::*;
use einfach_excel_core::custom_formulas::{CustomFormulaAction, CustomFormulaDefinition};
use einfach_excel_core::workbook::NamedRangeAction;

/// `Other` is protected and computes from a name and a custom formula defined elsewhere.
fn protected_consumer() -> (Workbook, WorkbookHistory) {
    let mut book = Workbook::new();
    book.add_sheet("Other");
    book.set_cell(0, "A1", Value::Number(10.0));
    book.set_cell(0, "A2", Value::Number(20.0));
    assert!(book.set_formula(1, "A1", "=SUM(Sales)"));
    assert!(book.set_formula(1, "A2", "=TWICE(4)"));
    book.change_protection(1, ProtectionChange::Protect).unwrap();
    (book, WorkbookHistory::default())
}

#[test]
fn names_change_and_replay_while_a_consuming_sheet_is_protected() {
    // 回归：任一工作表受保护就拒绝修改名称，演示里的受保护样表让名称管理器在整本簿上失效。
    let (mut book, mut history) = protected_consumer();
    let create = NamedRangeAction::Create { name: "Sales".into(), sheet: 0, range: range(0, 0, 1, 0) };
    assert!(history.change_named_range(&mut book, 0, create).unwrap());
    assert_eq!(book.get_cell("Other", "A1"), Value::Number(30.0));
    history.undo(&mut book).unwrap();
    assert!(matches!(book.get_cell("Other", "A1"), Value::Error(_)));
    history.redo(&mut book).unwrap();
    assert_eq!(book.get_cell("Other", "A1"), Value::Number(30.0));
    assert!(book.define_name("Factor", "=2").is_ok());
    assert!(book.undefine_name("Factor"));
}

#[test]
fn custom_formulas_change_and_replay_while_a_consuming_sheet_is_protected() {
    let (mut book, mut history) = protected_consumer();
    let definition = CustomFormulaDefinition {
        name: "TWICE".into(), parameters: vec!["x".into()], expression: "=x*2".into(),
    };
    assert!(history.change_custom_formula(&mut book, 0, CustomFormulaAction::Upsert { definition }).unwrap());
    assert_eq!(book.get_cell("Other", "A2"), Value::Number(8.0));
    history.undo(&mut book).unwrap();
    assert!(matches!(book.get_cell("Other", "A2"), Value::Error(_)));
    history.redo(&mut book).unwrap();
    assert_eq!(book.get_cell("Other", "A2"), Value::Number(8.0));
}
