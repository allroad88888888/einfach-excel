use einfach_core::Value;
use einfach_excel_core::{CellAddress, CellFormat, CellRange, CellStyle, StyleScope, Workbook,
    workbook_history::WorkbookHistory};
use einfach_excel_core::rich_text::{RichTextFormat, RichTextRun};

fn addr(value: &str) -> CellAddress { CellAddress::parse(value).unwrap() }
fn range(value: &str) -> CellRange { CellRange::single(addr(value)) }
fn shrink(value: bool) -> CellStyle {
    CellStyle { shrink_to_fit: Some(value), ..Default::default() }
}

#[test]
fn sparse_false_overrides_axis_shrink_without_creating_default_cell_styles() {
    let mut book = Workbook::new();
    let sheet = book.sheet_mut(0).unwrap();
    sheet.patch_format_range(range("A1"), StyleScope::Column, shrink(true));
    sheet.patch_format_range(range("A2"), StyleScope::Row, shrink(true));
    sheet.patch_format_range(range("A2"), StyleScope::Cell, shrink(false));
    assert!(sheet.get_format("A1").shrink_to_fit);
    assert!(sheet.get_format("B2").shrink_to_fit);
    assert!(!sheet.get_format("A2").shrink_to_fit);
    assert!(!sheet.get_format("D4").shrink_to_fit);
    let snapshot = sheet.snapshot_format_range(CellRange::new(addr("A1"), addr("D4")));
    assert!(snapshot.cell_styles.iter().any(|(a, style)| *a == addr("A2") && style.shrink_to_fit == Some(false)));
    assert!(!snapshot.cell_styles.iter().any(|(a, _)| *a == addr("D4")));
    assert_eq!(CellStyle::from_format(CellFormat::default()).shrink_to_fit, Some(false));
    assert!(!CellStyle::default().overlaps(&shrink(false)));
    assert!(shrink(false).overlaps(&shrink(true)));
}

#[test]
fn layout_switch_is_one_history_entry_and_keeps_nominal_sizes_values_and_runs() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    book.set_cell_input(0, "A1", "H2O").unwrap();
    book.set_cell_input(0, "B1", "12.5").unwrap();
    book.set_formula(0, "C1", "=B1*2");
    let runs = vec![RichTextRun { text: "H2O".into(), format: RichTextFormat {
        font_size: Some(18.0), bold: Some(true), ..Default::default()
    } }];
    let sheet = book.sheet_mut(0).unwrap();
    sheet.set_rich_text(addr("A1"), runs.clone()).unwrap();
    sheet.patch_format_range(range("A1"), StyleScope::Cell,
        CellStyle { wrap_text: Some(true), font_size: Some(Some(24)), ..Default::default() });
    let targets = [(range("A1"), StyleScope::Cell), (range("C1"), StyleScope::Cell)];
    let shrink_patch = CellStyle { shrink_to_fit: Some(true), wrap_text: Some(false), ..Default::default() };
    history.patch_format_selection(&mut book, 0, &targets, shrink_patch).unwrap();
    let sheet = book.sheet(0).unwrap();
    assert!(sheet.get_format("A1").shrink_to_fit && !sheet.get_format("A1").wrap_text);
    assert!(sheet.get_format("C1").shrink_to_fit && !sheet.get_format("C1").wrap_text);
    assert!(!sheet.get_format("B1").shrink_to_fit);
    assert_eq!(sheet.get_format("A1").font_size, Some(24));
    assert_eq!(sheet.rich_text(addr("A1")), Some(runs.as_slice()));
    assert_eq!(sheet.get_formula("C1").as_deref(), Some("=B1*2"));
    assert_eq!(book.get_cell("Sheet1", "C1"), Value::Number(25.0));
    assert_eq!(history.undo_count(), 1);
    history.undo(&mut book).unwrap();
    assert!(book.sheet(0).unwrap().get_format("A1").wrap_text);
    assert!(!book.sheet(0).unwrap().get_format("A1").shrink_to_fit);
    history.redo(&mut book).unwrap();
    let wrap_patch = CellStyle { shrink_to_fit: Some(false), wrap_text: Some(true), ..Default::default() };
    history.patch_format_selection(&mut book, 0, &targets, wrap_patch).unwrap();
    assert!(!book.sheet(0).unwrap().get_format("A1").shrink_to_fit);
    assert!(book.sheet(0).unwrap().get_format("A1").wrap_text);
    history.undo(&mut book).unwrap();
    assert!(book.sheet(0).unwrap().get_format("A1").shrink_to_fit);
    assert!(!book.sheet(0).unwrap().get_format("A1").wrap_text);
}

#[test]
fn imported_dual_flags_remain_stored_for_rendering_to_apply_wrap_precedence() {
    let mut format = CellFormat::default();
    CellStyle { shrink_to_fit: Some(true), wrap_text: Some(true), ..Default::default() }
        .apply_to(&mut format);
    assert!(format.shrink_to_fit && format.wrap_text);
    assert_eq!(format.font_size, None);
}
