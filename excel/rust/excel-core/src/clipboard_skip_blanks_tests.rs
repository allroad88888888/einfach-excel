//! 跳过空白只影响实际写入格，不改被跳过格的值、公式或样式。
use super::*;
use crate::{CellStyle, StyleScope};

fn range(start: &str, end: &str) -> CellRange {
    CellRange::new(
        CellAddress::parse(start).unwrap(),
        CellAddress::parse(end).unwrap(),
    )
}

fn skipping(start: &str, end: &str) -> ClipboardPasteOptions {
    ClipboardPasteOptions {
        skip_blanks: true,
        ..ClipboardPasteOptions::new(range(start, end))
    }
}

#[test]
fn blank_source_preserves_destination_formula_and_style_while_zero_and_false_are_written() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "B1", Value::Number(0.0));
    wb.set_cell(0, "C1", Value::Boolean(false));
    wb.set_formula(0, "A3", "=7*2");
    wb.sheet_mut(0).unwrap().patch_format_range(
        range("A1", "A1"),
        StyleScope::Cell,
        CellStyle {
            bold: Some(true),
            ..Default::default()
        },
    );
    wb.sheet_mut(0).unwrap().patch_format_range(
        range("A3", "A3"),
        StyleScope::Cell,
        CellStyle {
            italic: Some(true),
            ..Default::default()
        },
    );
    let clip = wb.capture_clipboard(0, range("A1", "C1"), false).unwrap();
    wb.paste_clipboard(&clip, 0, &skipping("A3", "A3")).unwrap();
    let sheet = wb.sheet(0).unwrap();
    assert_eq!(sheet.get_formula("A3").as_deref(), Some("=7*2"));
    assert_eq!(sheet.get_cell("A3"), Value::Number(14.0));
    assert!(sheet.get_format("A3").italic);
    assert!(!sheet.get_format("A3").bold);
    assert_eq!(sheet.get_cell("B3"), Value::Number(0.0));
    assert_eq!(sheet.get_cell("C3"), Value::Boolean(false));
}

#[test]
fn empty_string_formula_and_literal_are_not_blank_cells() {
    let mut wb = Workbook::new();
    wb.set_formula(0, "A1", "=\"\"");
    wb.set_cell(0, "B1", Value::Text(String::new()));
    wb.set_cell(0, "A3", Value::Number(7.0));
    wb.set_cell(0, "B3", Value::Number(8.0));
    let clip = wb.capture_clipboard(0, range("A1", "B1"), false).unwrap();
    wb.paste_clipboard(&clip, 0, &skipping("A3", "A3")).unwrap();
    let sheet = wb.sheet(0).unwrap();
    assert_eq!(sheet.get_formula("A3").as_deref(), Some("=\"\""));
    assert_eq!(sheet.get_cell("B3"), Value::Text(String::new()));
}

#[test]
fn external_blanks_are_skipped_in_each_transposed_tile() {
    let mut wb = Workbook::new();
    let clip = ClipboardSnapshot::from_tsv("\t0\nfalse\t'", ClipboardPasteMode::All).unwrap();
    wb.set_cell(0, "C3", Value::Number(99.0));
    wb.set_cell(0, "E5", Value::Number(88.0));
    let mut options = skipping("C3", "F6");
    options.transpose = true;
    wb.paste_clipboard(&clip, 0, &options).unwrap();
    let sheet = wb.sheet(0).unwrap();
    assert_eq!(sheet.get_cell("C3"), Value::Number(99.0));
    assert_eq!(sheet.get_cell("E5"), Value::Number(88.0));
    assert_eq!(sheet.get_cell("D3"), Value::Boolean(false));
    assert_eq!(sheet.get_cell("C4"), Value::Number(0.0));
    assert_eq!(sheet.get_cell("F6"), Value::Text(String::new()));
}

#[test]
fn protected_cells_are_allowed_only_when_their_source_is_skipped() {
    let mut wb = Workbook::new();
    let clip = ClipboardSnapshot::from_tsv("\t7", ClipboardPasteMode::All).unwrap();
    wb.set_cell(0, "A3", Value::Number(99.0));
    let mut options = skipping("A3", "A3");
    options.unlocked_ranges = Some(vec![range("B3", "B3")]);
    wb.paste_clipboard(&clip, 0, &options).unwrap();
    assert_eq!(wb.sheet(0).unwrap().get_cell("A3"), Value::Number(99.0));
    assert_eq!(wb.sheet(0).unwrap().get_cell("B3"), Value::Number(7.0));
    options.unlocked_ranges = Some(vec![range("A4", "A4")]);
    options.selection = range("A4", "A4");
    assert_eq!(
        wb.paste_clipboard(&clip, 0, &options),
        Err("CLIPBOARD_LOCKED")
    );
    assert_eq!(wb.sheet(0).unwrap().get_cell("B4"), Value::Null);
}

#[test]
fn skipped_spill_target_is_untouched_but_non_blank_spill_target_rejects_atomically() {
    let mut wb = Workbook::new();
    wb.set_formula(0, "A1", "=SEQUENCE(2)");
    wb.sheet(0).unwrap().get_cell("A1");
    let clip = ClipboardSnapshot::from_tsv("\t7", ClipboardPasteMode::All).unwrap();
    wb.paste_clipboard(&clip, 0, &skipping("A2", "A2")).unwrap();
    assert_eq!(wb.sheet(0).unwrap().get_cell("A2"), Value::Number(2.0));
    let clip = ClipboardSnapshot::from_tsv("8\t9", ClipboardPasteMode::All).unwrap();
    assert_eq!(
        wb.paste_clipboard(&clip, 0, &skipping("A2", "A2")),
        Err("CLIPBOARD_SPILL_TARGET")
    );
    assert_eq!(wb.sheet(0).unwrap().get_cell("B2"), Value::Number(7.0));
}

#[test]
fn cut_skip_blanks_rejects_without_clearing_source() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(7.0));
    let clip = wb.capture_clipboard(0, range("A1", "B1"), true).unwrap();
    assert_eq!(
        wb.paste_clipboard(&clip, 0, &skipping("A3", "A3")),
        Err("CLIPBOARD_CUT_SPECIAL")
    );
    assert_eq!(wb.sheet(0).unwrap().get_cell("A1"), Value::Number(7.0));
}
