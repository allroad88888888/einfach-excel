use crate::{CellAddress, CellFormat, Sheet};
use einfach_core::Value;

#[test]
fn multiline_edit_grows_only_its_row_and_preserves_the_text() {
    let mut sheet = Sheet::new();
    sheet.set_cell("C3", Value::Text("first\nsecond".into()));
    assert_eq!(sheet.get_cell("C3"), Value::Text("first\nsecond".into()));
    assert_eq!(sheet.all_row_heights(), vec![(2, 37)]);
    assert!(sheet.get_format("C3").wrap_text);
    sheet.set_cell("C3", Value::Text("short".into()));
    assert_eq!(sheet.row_height(2), Some(37));
}

#[test]
fn multiline_height_uses_the_cell_font_and_never_shrinks_an_existing_row() {
    let mut sheet = Sheet::new();
    sheet.set_format(
        "C3",
        CellFormat {
            font_size: Some(36),
            ..Default::default()
        },
    );
    sheet.set_cell("C3", Value::Text("one\ntwo\n".into()));
    assert_eq!(sheet.row_height(2), Some(139));
    sheet.set_cell("D3", Value::Text("one\ntwo".into()));
    assert_eq!(sheet.row_height(2), Some(139));
    assert_eq!(sheet.row_height(3), None);
}

#[test]
fn bulk_text_grows_the_row_without_overwriting_destination_wrap_style() {
    let mut wb = crate::Workbook::new();
    wb.bulk_load(|loader| {
        loader.set_cell_at(0, CellAddress::new(2, 2), Value::Text("one\ntwo".into()))
    });
    let sheet = wb.sheet(0).unwrap();
    assert_eq!(sheet.row_height(2), Some(37));
    assert!(!sheet.get_format("C3").wrap_text);
}
