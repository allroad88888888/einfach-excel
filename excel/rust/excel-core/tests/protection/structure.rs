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

/// Two sheets: `Sheet1` stays open, `Other` is protected and points at `Sheet1!A2`.
fn open_sheet_beside_protected_reference() -> Workbook {
    let mut book = Workbook::new();
    book.add_sheet("Other");
    book.set_cell(0, "A2", Value::Number(5.0));
    assert!(book.set_formula(1, "A1", "=Sheet1!A2"));
    book.change_protection(1, ProtectionChange::Protect).unwrap();
    book
}
fn other_formula(book: &Workbook) -> Option<String> { book.sheet(1).unwrap().get_formula("A1") }
fn set_other(book: &mut Workbook, mode: ProtectionChange) { book.change_protection(1, mode).unwrap(); }

#[test]
fn row_edits_on_an_open_sheet_rewrite_references_in_a_protected_sheet() {
    // 回归：任一工作表受保护就拒绝所有插删行列，演示工作簿里的受保护样表让整本簿无法改结构。
    let mut book = open_sheet_beside_protected_reference();
    let mut history = WorkbookHistory::default();
    history.edit_structure(&mut book, 0, ShiftEdit::RowInsert { at: 0, count: 1 }).unwrap();
    assert_eq!(other_formula(&book).as_deref(), Some("=Sheet1!A3"));
    assert_eq!(book.get_cell("Other", "A1"), Value::Number(5.0));
    assert!(book.try_structural_edit(1, ShiftEdit::RowInsert { at: 0, count: 1 }).is_err());
    history.undo(&mut book).unwrap();
    assert_eq!(other_formula(&book).as_deref(), Some("=Sheet1!A2"));
    history.redo(&mut book).unwrap();
    assert_eq!(other_formula(&book).as_deref(), Some("=Sheet1!A3"));
}

#[test]
fn replay_restores_only_rewritten_formulas_on_a_protected_referencing_sheet() {
    // 回归（#17）：撤销整份恢复引用表快照，受保护引用表上之后改的列宽被改回。
    let mut book = open_sheet_beside_protected_reference();
    set_other(&mut book, ProtectionChange::Unprotect);
    book.sheet_mut(1).unwrap().set_col_width(0, 80);
    let mut history = WorkbookHistory::default();
    history.edit_structure(&mut book, 0, ShiftEdit::RowInsert { at: 0, count: 1 }).unwrap();
    book.sheet_mut(1).unwrap().set_col_width(0, 200);
    set_other(&mut book, ProtectionChange::Protect);
    history.undo(&mut book).unwrap();
    assert_eq!(book.sheet(1).unwrap().col_width(0), Some(200));
    assert_eq!(other_formula(&book).as_deref(), Some("=Sheet1!A2"));
    history.redo(&mut book).unwrap();
    assert_eq!(book.sheet(1).unwrap().col_width(0), Some(200));
    assert_eq!(other_formula(&book).as_deref(), Some("=Sheet1!A3"));
}

#[test]
fn cell_shifts_on_an_open_sheet_follow_into_a_protected_sheet() {
    let mut book = open_sheet_beside_protected_reference();
    let mut history = WorkbookHistory::default();
    let down = einfach_excel_core::CellShiftDirection::InsertDown;
    assert!(history.shift_cells(&mut book, 0, range(0, 0, 0, 0), down).unwrap());
    assert_eq!(other_formula(&book).as_deref(), Some("=Sheet1!A3"));
    history.undo(&mut book).unwrap();
    assert_eq!(other_formula(&book).as_deref(), Some("=Sheet1!A2"));
    assert!(history.shift_cells(&mut book, 1, range(0, 0, 0, 0), down).is_err());
}

#[test]
fn replaying_a_row_edit_requires_the_edited_sheet_to_be_open_now() {
    let mut book = open_sheet_beside_protected_reference();
    set_other(&mut book, ProtectionChange::Unprotect);
    let mut history = WorkbookHistory::default();
    history.edit_structure(&mut book, 0, ShiftEdit::RowInsert { at: 0, count: 1 }).unwrap();
    protect(&mut book);
    assert!(history.undo(&mut book).is_err());
    unprotect(&mut book);
    history.undo(&mut book).unwrap();
    assert_eq!(other_formula(&book).as_deref(), Some("=Sheet1!A2"));
}
