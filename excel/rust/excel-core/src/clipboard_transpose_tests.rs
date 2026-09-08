//! 转置的坐标映射及整次拒绝规则。
use super::*;
use crate::{CellStyle, StyleScope};

fn range(start: &str, end: &str) -> CellRange {
    CellRange::new(
        CellAddress::parse(start).unwrap(),
        CellAddress::parse(end).unwrap(),
    )
}

fn transpose(start: &str, end: &str) -> ClipboardPasteOptions {
    ClipboardPasteOptions {
        transpose: true,
        ..ClipboardPasteOptions::new(range(start, end))
    }
}

#[test]
fn transposes_a_non_square_matrix_then_tiles_using_the_rotated_dimensions() {
    let mut wb = Workbook::new();
    let clip = ClipboardSnapshot::from_tsv("1\t2\t3\n4\t5\t6", ClipboardPasteMode::All).unwrap();
    assert_eq!(
        wb.paste_clipboard(&clip, 0, &transpose("B2", "B2"))
            .unwrap(),
        range("B2", "C4")
    );
    assert_eq!(wb.sheet(0).unwrap().get_cell("C4"), Value::Number(6.0));
    wb.paste_clipboard(&clip, 0, &transpose("E2", "H7"))
        .unwrap();
    let sheet = wb.sheet(0).unwrap();
    for (addr, value) in [
        ("E2", 1.),
        ("F2", 4.),
        ("E3", 2.),
        ("F4", 6.),
        ("G5", 1.),
        ("H7", 6.),
    ] {
        assert_eq!(sheet.get_cell(addr), Value::Number(value));
    }
}

#[test]
fn internal_transpose_preserves_styles_and_shifts_mixed_references_from_each_source_cell() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(2.0));
    wb.set_formula(0, "B1", "=A1+$A1+A$1+$A$1");
    wb.sheet_mut(0).unwrap().patch_format_range(
        range("B1", "B1"),
        StyleScope::Cell,
        CellStyle {
            bold: Some(true),
            ..Default::default()
        },
    );
    let clip = wb.capture_clipboard(0, range("A1", "B1"), false).unwrap();
    wb.paste_clipboard(&clip, 0, &transpose("D4", "D4"))
        .unwrap();
    let sheet = wb.sheet(0).unwrap();
    assert_eq!(sheet.get_cell("D4"), Value::Number(2.0));
    assert_eq!(
        crate::parse_formula(&sheet.get_formula("D5").unwrap()),
        crate::parse_formula("=C5+$A5+C$1+$A$1")
    );
    assert!(sheet.get_format("D5").bold);
    assert_eq!(sheet.get_formula("B1").as_deref(), Some("=A1+$A1+A$1+$A$1"));
}

#[test]
fn transpose_can_combine_with_values_and_formats_without_retaining_formulas() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(3.0));
    wb.set_formula(0, "B1", "=A1*2");
    wb.sheet_mut(0).unwrap().patch_format_range(
        range("B1", "B1"),
        StyleScope::Cell,
        CellStyle {
            italic: Some(true),
            ..Default::default()
        },
    );
    let clip = wb.capture_clipboard(0, range("A1", "B1"), false).unwrap();
    wb.set_cell(0, "A1", Value::Number(10.0));
    let mut options = transpose("D4", "D4");
    options.mode = ClipboardPasteMode::ValuesAndFormats;
    wb.paste_clipboard(&clip, 0, &options).unwrap();
    let sheet = wb.sheet(0).unwrap();
    assert_eq!(sheet.get_cell("D5"), Value::Number(6.0));
    assert_eq!(sheet.get_formula("D5"), None);
    assert!(sheet.get_format("D5").italic);
}

#[test]
fn transpose_checks_rotated_boundaries_dimensions_and_protection_before_any_write() {
    let mut wb = Workbook::new();
    let clip = ClipboardSnapshot::from_tsv("1\t2\t3", ClipboardPasteMode::All).unwrap();
    wb.set_cell(0, "A1", Value::Number(99.0));
    let mut options = transpose("A1", "A1");
    options.row_count = 2;
    assert_eq!(
        wb.paste_clipboard(&clip, 0, &options),
        Err("CLIPBOARD_OUTSIDE_SHEET")
    );
    options.row_count = 10;
    options.unlocked_ranges = Some(vec![range("A1", "C1")]);
    assert_eq!(
        wb.paste_clipboard(&clip, 0, &options),
        Err("CLIPBOARD_LOCKED")
    );
    assert_eq!(
        wb.paste_clipboard(&clip, 0, &transpose("A1", "C1")),
        Err("CLIPBOARD_SELECTION_SIZE")
    );
    assert_eq!(wb.sheet(0).unwrap().get_cell("A1"), Value::Number(99.0));
    assert_eq!(wb.sheet(0).unwrap().get_cell("A2"), Value::Null);
}

#[test]
fn cut_transpose_rejects_but_keeps_the_source_available_for_normal_move() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(5.0));
    let clip = wb.capture_clipboard(0, range("A1", "B1"), true).unwrap();
    assert_eq!(
        wb.paste_clipboard(&clip, 0, &transpose("C3", "C3")),
        Err("CLIPBOARD_CUT_SPECIAL")
    );
    assert_eq!(wb.sheet(0).unwrap().get_cell("A1"), Value::Number(5.0));
    wb.paste_clipboard(&clip, 0, &ClipboardPasteOptions::new(range("C3", "C3")))
        .unwrap();
    assert_eq!(wb.sheet(0).unwrap().get_cell("A1"), Value::Null);
    assert_eq!(wb.sheet(0).unwrap().get_cell("C3"), Value::Number(5.0));
}
