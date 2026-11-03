//! Creating a sheet is independent of worksheet cell protection.
use super::*;

#[test]
fn raw_and_checked_add_allow_protected_neighbors_but_keep_new_sheets_open() {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Number(7.0));
    protect(&mut book);
    let protection = book.read_protection(0).unwrap();
    assert_eq!(book.add_sheet("Raw"), 1);
    assert_eq!(book.edit_sheet(None, "Checked").unwrap(), 2);
    assert_eq!(book.sheet_count(), 3);
    assert!(book.edit_sheet(None, "Checked").is_err());
    assert!(book.edit_sheet(None, "Invalid/Name").is_err());
    assert_eq!(book.sheet_count(), 3);
    assert_eq!(book.read_protection(1).unwrap(), SheetProtection::default());
    assert_eq!(book.read_protection(2).unwrap(), SheetProtection::default());
    book.set_cell_input(2, "A1", "42").unwrap();
    assert!(book.set_cell_input(0, "A1", "99").is_err());
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(7.0));
    assert_eq!(book.read_protection(0).unwrap(), protection);
}

#[test]
fn add_edit_undo_redo_preserve_protected_formula_sources_and_sheet_identity() {
    let mut book = Workbook::new();
    book.set_formula(0, "A1", "=Future!A1+1");
    protect(&mut book);
    let protection = book.read_protection(0).unwrap();
    let mut history = WorkbookHistory::default();
    let added = history.edit_sheet(&mut book, None, "Future").unwrap();
    let key = book.sheet_key(added);
    history.set_cell_input(&mut book, added, "A1", "41").unwrap();
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(42.0));
    history.undo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(1.0));
    for _ in 0..3 {
        assert!(history.undo(&mut book).unwrap());
        assert_eq!(book.sheet_count(), 1);
        assert_eq!(book.sheet(0).unwrap().get_formula("A1").as_deref(), Some("=Future!A1+1"));
        assert!(matches!(book.get_cell("Sheet1", "A1"), Value::Error(_)));
        assert!(history.redo(&mut book).unwrap());
        assert_eq!(book.sheet_count(), 2);
        assert_eq!(book.sheet_key(1), key);
        assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(1.0));
        assert_eq!(book.read_protection(0).unwrap(), protection);
    }
    history.redo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(42.0));
    assert!(book.set_cell_input(0, "A1", "99").is_err());
}

#[test]
fn undoing_a_protected_new_sheet_preserves_its_protection_when_restored() {
    let mut book = Workbook::new();
    protect(&mut book);
    let mut history = WorkbookHistory::default();
    let added = history.edit_sheet(&mut book, None, "New").unwrap();
    book.change_protection(added, ProtectionChange::Protect).unwrap();
    assert!(history.undo(&mut book).unwrap());
    assert_eq!(book.sheet_count(), 1);
    assert!(history.redo(&mut book).unwrap());
    assert_eq!(book.read_protection(0).unwrap().mode, ProtectionMode::Protected);
    assert_eq!(book.read_protection(added).unwrap().mode, ProtectionMode::Protected);
    assert!(book.set_cell_input(added, "A1", "99").is_err());
    assert!(history.remove_sheet(&mut book, added).is_ok());
    assert_eq!(book.sheet_count(), 1);
}
