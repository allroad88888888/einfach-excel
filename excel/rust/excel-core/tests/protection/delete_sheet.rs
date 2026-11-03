//! Deleting worksheet structure must not treat cell protection as a workbook lock.
use super::*;
use einfach_core::ValueError;

#[test]
fn deleting_a_new_sheet_with_protected_neighbors_supports_undo_redo() {
    let mut book = Workbook::new();
    book.set_cell_input(0, "A1", "7").unwrap();
    protect(&mut book);
    let protection = book.read_protection(0).unwrap();
    let mut history = WorkbookHistory::default();
    let added = history.edit_sheet(&mut book, None, "New").unwrap();
    history.set_cell_input(&mut book, added, "A1", "42").unwrap();
    let key = book.sheet_key(added);
    history.remove_sheet(&mut book, added).unwrap();
    for _ in 0..3 {
        assert_eq!(book.sheet_count(), 1);
        assert_eq!(book.read_protection(0).unwrap(), protection);
        assert!(book.set_cell_input(0, "A1", "99").is_err());
        assert!(history.undo(&mut book).unwrap());
        assert_eq!(book.sheet_key(added), key);
        assert_eq!(book.get_cell("New", "A1"), Value::Number(42.0));
        assert!(history.redo(&mut book).unwrap());
    }
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(7.0));
}

#[test]
fn deleting_a_protected_sheet_restores_its_identity_data_style_and_protection() {
    let mut book = Workbook::new();
    book.add_sheet("Keep");
    book.set_cell_input(0, "A1", "7").unwrap();
    book.sheet_mut(0).unwrap().patch_format_range(range(0, 0, 0, 0), StyleScope::Cell,
        CellStyle { bold: Some(true), ..Default::default() });
    allow(&mut book, range(1, 1, 2, 1));
    protect(&mut book);
    book.change_protection(1, ProtectionChange::Protect).unwrap();
    let protection = book.read_protection(0).unwrap();
    let key = book.sheet_key(0);
    let mut history = WorkbookHistory::default();
    history.remove_sheet(&mut book, 0).unwrap();
    for _ in 0..3 {
        assert_eq!(book.name(0), Some("Keep"));
        assert!(history.undo(&mut book).unwrap());
        assert_eq!(book.sheet_key(0), key);
        assert_eq!(book.read_protection(0).unwrap(), protection);
        assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(7.0));
        assert!(book.sheet(0).unwrap().effective_format("A1").bold);
        assert!(book.set_cell_input(0, "A1", "99").is_err());
        assert!(history.redo(&mut book).unwrap());
    }
    let count = history.undo_count();
    assert!(history.remove_sheet(&mut book, 0).is_err());
    assert_eq!(history.undo_count(), count);
    assert_eq!(book.sheet_count(), 1);
}

#[test]
fn delete_and_restore_rewrite_protected_formula_sources_without_unlocking_cells() {
    let mut book = Workbook::new();
    book.add_sheet("Summary");
    book.set_cell_input(0, "A1", "7").unwrap();
    book.set_formula(1, "A1", "=Sheet1!A1*2");
    book.set_formula(1, "B1", "=SEQUENCE(2,1,Sheet1!A1)");
    book.set_formula(1, "D1", "=A1+1");
    book.change_protection(1, ProtectionChange::Protect).unwrap();
    let protection = book.read_protection(1).unwrap();
    let mut history = WorkbookHistory::default();
    history.remove_sheet(&mut book, 0).unwrap();
    for _ in 0..3 {
        assert!(book.sheet(0).unwrap().get_formula("A1").unwrap().contains("#REF!"));
        assert_eq!(book.get_cell("Summary", "D1"), Value::Error(ValueError::InvalidRef));
        assert_eq!(book.read_protection(0).unwrap(), protection);
        assert!(history.undo(&mut book).unwrap());
        assert_eq!(book.sheet(1).unwrap().get_formula("A1").as_deref(), Some("=Sheet1!A1*2"));
        assert_eq!(book.get_cell("Summary", "D1"), Value::Number(15.0));
        assert_eq!(book.get_cell("Summary", "B2"), Value::Number(8.0));
        assert_eq!(book.read_protection(1).unwrap(), protection);
        assert!(!book.set_formula(1, "A1", "=99"));
        assert!(history.redo(&mut book).unwrap());
    }
    assert!(history.undo(&mut book).unwrap());
    book.set_cell_input(0, "A1", "9").unwrap();
    assert_eq!(book.get_cell("Summary", "D1"), Value::Number(19.0));
    assert_eq!(book.get_cell("Summary", "B2"), Value::Number(10.0));
}

#[test]
fn raw_archive_and_removal_obey_the_same_sheet_protection_semantics() {
    let mut book = Workbook::new();
    book.add_sheet("Keep");
    protect(&mut book);
    book.change_protection(1, ProtectionChange::Protect).unwrap();
    let archive = book.archive_sheet(0).unwrap();
    archive.restore(&mut book).unwrap();
    assert_eq!(book.read_protection(0).unwrap().mode, ProtectionMode::Protected);
    assert!(book.remove_sheet(0).is_some());
    assert!(book.remove_sheet(0).is_none());
}
