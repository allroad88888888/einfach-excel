//! A Table belongs to its worksheet: a protected neighbour neither blocks it nor escapes its rewrites.
use super::*;
use einfach_excel_core::TableStyle;

/// `Sheet1` holds an open Table; protected `Other` sums its column through a structured reference.
fn open_table_beside_protected_reference() -> (Workbook, WorkbookHistory) {
    let mut book = Workbook::new();
    book.add_sheet("Other");
    book.set_cell(0, "A1", Value::Text("Amount".into()));
    book.set_cell(0, "A2", Value::Number(2.0));
    book.set_cell(0, "A3", Value::Number(3.0));
    let mut history = WorkbookHistory::default();
    history.create_table(&mut book, 0, range(0, 0, 2, 0), Some("Sales")).unwrap();
    assert!(book.set_formula(1, "A1", "=SUM(Sales[Amount])"));
    book.change_protection(1, ProtectionChange::Protect).unwrap();
    (book, history)
}

#[test]
fn renaming_an_open_table_rewrites_a_protected_reference_through_history() {
    // 回归：任一工作表受保护就拒绝修改 Table，演示里的受保护样表让所有 Table 都不能改名、改样式。
    let (mut book, mut history) = open_table_beside_protected_reference();
    assert!(history.rename_table(&mut book, "Sales", "Orders").unwrap());
    assert_eq!(book.sheet(1).unwrap().get_formula("A1").as_deref(), Some("=SUM(Orders[Amount])"));
    assert_eq!(book.get_cell("Other", "A1"), Value::Number(5.0));
    history.undo(&mut book).unwrap();
    assert_eq!(book.sheet(1).unwrap().get_formula("A1").as_deref(), Some("=SUM(Sales[Amount])"));
    history.redo(&mut book).unwrap();
    assert!(book.get_table("Orders").is_some());
}

#[test]
fn open_table_metadata_and_creation_work_beside_a_protected_sheet() {
    let (mut book, mut history) = open_table_beside_protected_reference();
    let current = book.get_table("Sales").unwrap().style();
    let style = TableStyle { banded_rows: !current.banded_rows, ..current };
    assert!(history.set_table_style(&mut book, "Sales", style).unwrap());
    book.set_cell(0, "C1", Value::Text("Region".into()));
    book.set_cell(0, "C2", Value::Text("West".into()));
    history.create_table(&mut book, 0, range(0, 2, 1, 2), Some("Regions")).unwrap();
    history.undo(&mut book).unwrap();
    assert!(book.get_table("Regions").is_none());
    history.redo(&mut book).unwrap();
    assert!(book.get_table("Regions").is_some());
}

#[test]
fn a_protected_table_sheet_still_locks_the_definition_and_its_replay() {
    let (mut book, mut history) = open_table_beside_protected_reference();
    assert!(history.rename_table(&mut book, "Sales", "Orders").unwrap());
    protect(&mut book);
    assert!(history.rename_table(&mut book, "Orders", "Ledger").is_err());
    assert!(history.undo(&mut book).is_err());
    assert!(book.get_table("Orders").is_some());
    unprotect(&mut book);
    history.undo(&mut book).unwrap();
    assert!(book.get_table("Sales").is_some());
}
