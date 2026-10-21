//! Geometry follows current permission settings rather than rewinding settings from history.
use super::*;
use einfach_excel_core::shift::ShiftEdit;

#[test]
fn structural_undo_preserves_editable_ranges_configured_after_the_content_operation() {
    let mut book = Workbook::new();
    allow(&mut book, range(1, 0, 1, 0));
    let mut history = WorkbookHistory::default();
    history.edit_structure(&mut book, 0, ShiftEdit::RowInsert { at: 1, count: 1 }).unwrap();
    assert_eq!(book.read_protection(0).unwrap().unlocked_ranges, vec![range(2, 0, 2, 0).into()]);
    allow(&mut book, range(4, 1, 4, 1));
    history.undo(&mut book).unwrap();
    assert_eq!(book.read_protection(0).unwrap().unlocked_ranges,
        vec![range(1, 0, 1, 0).into(), range(3, 1, 3, 1).into()]);
    history.redo(&mut book).unwrap();
    assert_eq!(book.read_protection(0).unwrap().unlocked_ranges,
        vec![range(2, 0, 2, 0).into(), range(4, 1, 4, 1).into()]);
}

#[test]
fn editable_ranges_follow_stable_sheet_identity_when_moved_or_renamed() {
    let mut book = Workbook::new();
    allow(&mut book, range(1, 0, 1, 0));
    book.add_sheet("Other");
    assert!(book.move_sheet(0, 1));
    assert!(book.rename_sheet(1, "Renamed"));
    assert!(book.read_protection(0).unwrap().unlocked_ranges.is_empty());
    assert_eq!(book.read_protection(1).unwrap().unlocked_ranges,
        vec![range(1, 0, 1, 0).into()]);
}

#[test]
fn deleting_an_entire_editable_range_does_not_restore_authorization_from_content_undo() {
    let mut book = Workbook::new();
    allow(&mut book, range(1, 0, 1, 0));
    let mut history = WorkbookHistory::default();
    history.edit_structure(&mut book, 0, ShiftEdit::RowDelete { at: 1, count: 1 }).unwrap();
    assert!(book.read_protection(0).unwrap().unlocked_ranges.is_empty());
    history.undo(&mut book).unwrap();
    assert!(book.read_protection(0).unwrap().unlocked_ranges.is_empty());
}
