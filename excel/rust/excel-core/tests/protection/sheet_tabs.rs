//! Worksheet cell locks survive tab metadata/topology edits and their history.
use super::*;

#[test]
fn protected_rename_and_move_keep_sources_identity_and_edit_locks_through_history() {
    let mut book = Workbook::new();
    book.add_sheet("Summary");
    book.set_cell_input(0, "A1", "7").unwrap();
    book.set_formula(1, "A1", "=Sheet1!A1*2");
    protect(&mut book);
    book.change_protection(1, ProtectionChange::Protect).unwrap();
    let key = book.sheet_key(0);
    let protection = book.read_protection(0).unwrap();
    let mut history = WorkbookHistory::default();
    history.edit_sheet(&mut book, Some(0), "Renamed").unwrap();
    assert!(book.sheet(1).unwrap().get_formula("A1").unwrap().contains("Renamed!A1"));
    history.move_sheet(&mut book, 0, 1).unwrap();
    assert_eq!(book.sheet_key(1), key);
    assert_eq!(book.read_protection(1).unwrap(), protection);
    for _ in 0..3 {
        assert!(history.undo(&mut book).unwrap());
        assert!(history.undo(&mut book).unwrap());
        assert_eq!(book.sheet(1).unwrap().get_formula("A1").as_deref(), Some("=Sheet1!A1*2"));
        assert_eq!(book.get_cell("Summary", "A1"), Value::Number(14.0));
        assert!(book.set_cell_input(0, "A1", "99").is_err());
        assert!(history.redo(&mut book).unwrap());
        assert!(history.redo(&mut book).unwrap());
        assert_eq!(book.get_cell("Summary", "A1"), Value::Number(14.0));
        assert_eq!(book.sheet_key(1), key);
    }
}

#[test]
fn hiding_unhiding_and_coloring_protected_tabs_keep_last_visible_guard_and_history() {
    let mut book = Workbook::new();
    book.add_sheet("Other");
    protect(&mut book);
    book.change_protection(1, ProtectionChange::Protect).unwrap();
    let mut history = WorkbookHistory::default();
    assert!(history.set_sheet_hidden(&mut book, 0, true).unwrap());
    assert!(history.set_sheet_hidden(&mut book, 1, true).is_err());
    assert!(history.set_sheet_tab_color(&mut book, 1, Some("#ff0000")).unwrap());
    assert!(history.set_sheet_hidden(&mut book, 0, false).unwrap());
    for _ in 0..3 {
        for _ in 0..3 { assert!(history.undo(&mut book).unwrap()); }
        assert!(!book.sheet_hidden(0));
        assert_eq!(book.sheet_tab_color(1), None);
        for _ in 0..3 { assert!(history.redo(&mut book).unwrap()); }
        assert!(!book.sheet_hidden(0));
        assert_eq!(book.sheet_tab_color(1), Some("#FF0000"));
        assert!(book.set_cell_input(0, "A1", "99").is_err());
        assert!(book.set_cell_input(1, "A1", "99").is_err());
    }
}

#[test]
fn copying_protected_sheet_preserves_cells_formulas_editable_ranges_and_undo_redo() {
    let mut book = Workbook::new();
    book.set_cell_input(0, "A1", "7").unwrap();
    book.set_formula(0, "B1", "=Sheet1!A1*2");
    book.sheet_mut(0).unwrap().patch_format_range(range(0, 0, 0, 0), StyleScope::Cell,
        CellStyle { bold: Some(true), ..Default::default() });
    allow(&mut book, range(1, 1, 1, 1));
    protect(&mut book);
    let protection = book.read_protection(0).unwrap();
    let mut history = WorkbookHistory::default();
    let copy = history.duplicate_sheet(&mut book, 0).unwrap();
    let key = book.sheet_key(copy);
    for _ in 0..3 {
        assert_eq!(book.read_protection(copy).unwrap(), protection);
        assert_eq!(book.get_cell("Sheet1 (2)", "A1"), Value::Number(7.0));
        assert_eq!(book.get_cell("Sheet1 (2)", "B1"), Value::Number(14.0));
        assert!(book.sheet(copy).unwrap().get_formula("B1").unwrap().contains("Sheet1 (2)"));
        assert!(book.sheet(copy).unwrap().effective_format("A1").bold);
        assert!(book.set_cell_input(copy, "A1", "99").is_err());
        assert!(history.undo(&mut book).unwrap());
        assert_eq!(book.sheet_count(), 1);
        assert!(history.redo(&mut book).unwrap());
        assert_eq!(book.sheet_key(copy), key);
    }
    book.set_cell_input(copy, "B2", "42").unwrap();
    assert_eq!(book.get_cell("Sheet1", "B2"), Value::Null);
    assert_eq!(book.read_protection(0).unwrap(), protection);
}
