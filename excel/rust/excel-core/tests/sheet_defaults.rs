use einfach_excel_core::{Workbook, CellFormat};
use einfach_excel_core::sheet::SheetDefaults;
use einfach_excel_core::workbook_history::WorkbookHistory;

#[test]
fn defaults_are_sparse_and_explicit_font_overrides_still_win() {
    let mut book = Workbook::new();
    let sheet = book.sheet_mut(0).unwrap();
    let defaults = SheetDefaults { row_height: Some(36), col_width: Some(160), font_size: Some(18) };
    sheet.set_defaults(defaults).unwrap();
    assert_eq!(sheet.get_format("A1048576").font_size, Some(18));
    assert!(sheet.all_row_heights().is_empty());
    assert!(sheet.all_col_widths().is_empty());
    sheet.set_format("A1", CellFormat { font_size: Some(16), ..Default::default() });
    assert_eq!(sheet.all_row_heights(), vec![(0, 36)]);
    sheet.set_format("B2", CellFormat { font_size: Some(24), ..Default::default() });
    assert_eq!(sheet.get_format("B2").font_size, Some(24));
    assert_eq!(sheet.get_format("C2").font_size, Some(18));
    sheet.set_format("B2", CellFormat::default());
    assert_eq!(sheet.get_format("B2").font_size, Some(18));
    assert!(sheet.set_defaults(SheetDefaults { row_height: Some(0), ..defaults }).is_err());
    assert_eq!(sheet.defaults(), defaults);
}

#[test]
fn copying_and_undoing_sheet_creation_preserves_native_defaults() {
    let mut book = Workbook::new();
    let defaults = SheetDefaults { row_height: Some(36), col_width: Some(160), font_size: Some(18) };
    book.sheet_mut(0).unwrap().set_defaults(defaults).unwrap();
    let mut history = WorkbookHistory::default();
    let copy = history.duplicate_sheet(&mut book, 0).unwrap();
    assert_eq!(book.sheet(copy).unwrap().defaults(), defaults);
    assert_eq!(book.sheet(copy).unwrap().get_format("X100").font_size, Some(18));
    assert!(history.undo(&mut book).unwrap());
    assert_eq!(book.sheet_count(), 1);
    assert!(history.redo(&mut book).unwrap());
    assert_eq!(book.sheet(copy).unwrap().defaults(), defaults);
}
