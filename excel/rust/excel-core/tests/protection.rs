//! Native acceptance tests use public Workbook/History APIs, never a UI-only mirror.
#[path = "protection/bulk.rs"]
mod bulk;
#[path = "protection/structure.rs"]
mod structure;
use einfach_core::Value;
use einfach_excel_core::{CellAddress, CellRange, CellStyle, StyleScope, Workbook};
use einfach_excel_core::protection::{ProtectionChange, ProtectionMode, ProtectionRange, SheetProtection};
use einfach_excel_core::workbook_history::{ClearSelectionMode, WorkbookHistory};
use einfach_excel_core::clipboard::{ClipboardPasteOptions, ClipboardSnapshot, ClipboardPasteMode};

fn range(r0: u32, c0: u32, r1: u32, c1: u32) -> CellRange {
    CellRange::new(CellAddress::new(r0, c0), CellAddress::new(r1, c1))
}
fn allow(book: &mut Workbook, target: CellRange) {
    book.change_protection(0, ProtectionChange::AllowRange { range: target.into() }).unwrap();
}
fn protect(book: &mut Workbook) { book.change_protection(0, ProtectionChange::Protect).unwrap(); }
fn unprotect(book: &mut Workbook) { book.change_protection(0, ProtectionChange::Unprotect).unwrap(); }

#[test]
fn protection_union_checks_all_cells_and_metadata_remains_locked() {
    let mut book = Workbook::new();
    allow(&mut book, range(1, 1, 2, 2));
    allow(&mut book, range(1, 3, 2, 4));
    protect(&mut book);
    assert!(book.ensure_range_editable(0, range(1, 1, 2, 4)).is_ok());
    assert!(book.ensure_range_editable(0, range(0, 1, 2, 4)).is_err());
    assert!(book.ensure_sheet_unprotected(0).is_err());
    assert!(book.change_protection(0, ProtectionChange::AllowRange {
        range: range(8, 8, 8, 8).into(),
    }).is_err());
    unprotect(&mut book);
    assert_eq!(book.read_protection(0).unwrap().unlocked_ranges.len(), 2);
}

#[test]
fn invalid_restore_is_atomic_and_legacy_default_is_open() {
    let mut book = Workbook::new();
    assert_eq!(book.read_protection(0).unwrap(), SheetProtection::default());
    allow(&mut book, range(1, 1, 2, 2));
    let before = book.read_protection(0).unwrap();
    let bad = SheetProtection { mode: ProtectionMode::Protected, unlocked_ranges: vec![
        ProtectionRange { row_start: 1, row_end: 0, col_start: 0, col_end: 1 },
    ] };
    assert!(book.restore_protection(vec![(0, bad)]).is_err());
    assert_eq!(book.read_protection(0).unwrap(), before);
    assert!(book.restore_protection(vec![(0, before.clone()), (0, before.clone())]).is_err());
    assert_eq!(book.read_protection(0).unwrap(), before);
    assert!(book.read_protection(10).is_err());
}

#[test]
fn native_raw_input_and_formula_cannot_modify_locked_cells() {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Number(7.0));
    allow(&mut book, range(1, 1, 1, 1));
    protect(&mut book);
    book.set_cell(0, "A1", Value::Number(99.0));
    book.clear_cell(0, "A1");
    assert!(!book.set_formula(0, "A1", "=99"));
    assert!(book.set_cell_input(0, "A1", "99").is_err());
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(7.0));
    book.set_cell_input(0, "B2", "=2+3").unwrap();
    assert_eq!(book.get_cell("Sheet1", "B2"), Value::Number(5.0));
    assert!(book.try_set_cell(0, "A1", Value::Number(99.0)).is_err());
    assert!(book.try_clear_cell(0, "A1").is_err());
    assert!(book.try_set_formula(0, "A1", "=99").is_err());
}

#[test]
fn current_protection_controls_undo_redo_without_adding_settings_to_history() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    history.set_cell_input(&mut book, 0, "A1", "5").unwrap();
    protect(&mut book);
    assert_eq!(history.undo_count(), 1);
    assert!(history.undo(&mut book).is_err());
    assert_eq!(history.undo_count(), 1);
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(5.0));
    unprotect(&mut book);
    assert!(history.undo(&mut book).unwrap());
    assert_eq!(history.redo_count(), 1);
    protect(&mut book);
    assert!(history.redo(&mut book).is_err());
    assert_eq!(history.redo_count(), 1);
    unprotect(&mut book);
    assert!(history.redo(&mut book).unwrap());
    assert_eq!(book.read_protection(0).unwrap().mode, ProtectionMode::Open);
}

#[test]
fn editable_cell_input_format_clear_and_history_work_inside_protection() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    allow(&mut book, range(1, 1, 1, 1));
    protect(&mut book);
    history.set_cell_input(&mut book, 0, "B2", "42").unwrap();
    history.patch_format_selection(&mut book, 0, &[(range(1, 1, 1, 1), StyleScope::Cell)],
        CellStyle { bold: Some(true), ..Default::default() }).unwrap();
    assert!(history.patch_format_selection(&mut book, 0,
        &[(range(1, 0, 1, 1), StyleScope::Cell)], CellStyle::default()).is_err());
    history.clear_selection(&mut book, 0, &[(range(1, 1, 1, 1), StyleScope::Cell)],
        ClearSelectionMode::Contents).unwrap();
    assert_eq!(book.get_cell("Sheet1", "B2"), Value::Null);
    history.undo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "B2"), Value::Number(42.0));
    assert_eq!(book.read_protection(0).unwrap().mode, ProtectionMode::Protected);
}

#[test]
fn clipboard_cannot_forge_unlocked_policy_or_clear_a_newly_locked_cut_source() {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Number(7.0));
    let cut = book.capture_clipboard(0, range(0, 0, 0, 0), true).unwrap();
    allow(&mut book, range(1, 1, 1, 1));
    protect(&mut book);
    let options = ClipboardPasteOptions::new(range(1, 1, 1, 1));
    assert!(book.paste_clipboard(&cut, 0, &options).is_err());
    let text = ClipboardSnapshot::from_tsv("99", ClipboardPasteMode::All).unwrap();
    let mut forged = ClipboardPasteOptions::new(range(0, 0, 0, 0));
    forged.unlocked_ranges = Some(vec![range(0, 0, 10, 10)]);
    assert!(book.paste_clipboard(&text, 0, &forged).is_err());
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(7.0));
    assert_eq!(book.get_cell("Sheet1", "B2"), Value::Null);
    book.paste_clipboard(&text, 0, &options).unwrap();
    assert_eq!(book.get_cell("Sheet1", "B2"), Value::Number(99.0));
}

#[test]
fn protected_metadata_and_topology_reject_without_rewriting_other_sheets() {
    let mut book = Workbook::new();
    book.add_sheet("Other");
    let mut history = WorkbookHistory::default();
    allow(&mut book, range(0, 0, 10, 10));
    protect(&mut book);
    assert!(book.try_structural_edit(0,
        einfach_excel_core::shift::ShiftEdit::RowInsert { at: 0, count: 1 }).is_err());
    assert!(history.set_data_validation(&mut book, 0, range(0, 0, 0, 0), None).is_err());
    assert!(book.define_table(Some("Blocked"), 0, range(0, 0, 1, 1), true).is_err());
    assert!(!book.rename_sheet(0, "Renamed"));
    assert!(!book.move_sheet(0, 1));
    assert_eq!(book.name(0), Some("Sheet1"));
    assert_eq!(book.sheet_count(), 2);
    assert_eq!(history.undo_count(), 0);
}
