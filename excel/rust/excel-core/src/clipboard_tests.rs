use super::*;
use crate::{CellStyle, StyleScope};

fn addr(text: &str) -> CellAddress {
    CellAddress::parse(text).unwrap()
}
fn range(start: &str, end: &str) -> CellRange {
    CellRange::new(addr(start), addr(end))
}
fn workbook() -> Workbook {
    let mut wb = Workbook::new();
    wb.rename_sheet(0, "Orders");
    wb
}

#[test]
fn copy_freezes_values_and_effective_styles_then_shifts_relative_formulas() {
    let mut wb = workbook();
    wb.set_cell(0, "A1", Value::Number(3.0));
    wb.set_formula(0, "B1", "=A1+$A$1");
    wb.sheet_mut(0).unwrap().patch_format_range(
        range("A1", "B1"),
        StyleScope::Row,
        CellStyle {
            bold: Some(true),
            ..Default::default()
        },
    );
    let clip = wb.capture_clipboard(0, range("A1", "B1"), false).unwrap();
    assert_eq!(clip.text(), "3\t6");
    wb.set_cell(0, "A1", Value::Number(10.0));
    wb.paste_clipboard(&clip, 0, &ClipboardPasteOptions::new(range("A2", "A2")))
        .unwrap();
    assert_eq!(wb.sheet(0).unwrap().get_cell("A2"), Value::Number(3.0));
    assert_eq!(wb.sheet(0).unwrap().get_cell("B2"), Value::Number(13.0));
    assert_eq!(
        wb.sheet(0).unwrap().get_formula("B2").as_deref(),
        Some("=(A2+$A$1)")
    );
    assert!(wb.sheet(0).unwrap().effective_format("B2").bold);
    wb.paste_clipboard(&clip, 0, &ClipboardPasteOptions::new(range("A3", "A3")))
        .unwrap();
    assert_eq!(wb.sheet(0).unwrap().get_cell("A3"), Value::Number(3.0));
}

#[test]
fn copy_default_format_overrides_target_row_style_without_copying_row_height() {
    let mut wb = workbook();
    wb.sheet_mut(0).unwrap().patch_format_range(
        range("A2", "B2"),
        StyleScope::Row,
        CellStyle {
            bold: Some(true),
            ..Default::default()
        },
    );
    let clip = wb.capture_clipboard(0, range("A1", "A1"), false).unwrap();
    wb.paste_clipboard(&clip, 0, &ClipboardPasteOptions::new(range("A2", "A2")))
        .unwrap();
    assert!(!wb.sheet(0).unwrap().effective_format("A2").bold);
    assert!(wb.sheet(0).unwrap().effective_format("B2").bold);
}

#[test]
fn overlapping_cut_waits_for_paste_and_retargets_dependents() {
    let mut wb = workbook();
    wb.set_cell(0, "A1", Value::Number(2.0));
    wb.set_formula(0, "B1", "=A1*3");
    wb.set_formula(0, "F1", "=$A$1+B1");
    let clip = wb.capture_clipboard(0, range("A1", "B1"), true).unwrap();
    assert_eq!(wb.sheet(0).unwrap().get_cell("A1"), Value::Number(2.0));
    wb.paste_clipboard(&clip, 0, &ClipboardPasteOptions::new(range("B1", "B1")))
        .unwrap();
    let sheet = wb.sheet(0).unwrap();
    assert_eq!(sheet.get_cell("A1"), Value::Null);
    assert_eq!(sheet.get_cell("B1"), Value::Number(2.0));
    assert_eq!(sheet.get_cell("C1"), Value::Number(6.0));
    assert_eq!(sheet.get_cell("F1"), Value::Number(8.0));
    assert_eq!(sheet.get_formula("F1").as_deref(), Some("=($B$1+C1)"));
}

#[test]
fn cut_formula_keeps_unmoved_references_and_other_sheet_references_follow_source() {
    let mut wb = workbook();
    wb.add_sheet("Other");
    wb.set_cell(0, "A1", Value::Number(4.0));
    wb.set_formula(0, "B1", "=A1*2");
    wb.set_formula(1, "A1", "=Orders!B1");
    let clip = wb.capture_clipboard(0, range("B1", "B1"), true).unwrap();
    wb.paste_clipboard(&clip, 0, &ClipboardPasteOptions::new(range("D3", "D3")))
        .unwrap();
    assert_eq!(
        wb.sheet(0).unwrap().get_formula("D3").as_deref(),
        Some("=A1*2")
    );
    assert_eq!(wb.sheet(1).unwrap().get_cell("A1"), Value::Number(8.0));
    wb.set_cell(0, "A1", Value::Number(5.0));
    assert_eq!(wb.sheet(1).unwrap().get_cell("A1"), Value::Number(10.0));
}

#[test]
fn changed_cut_source_is_rejected_without_erasing_either_side() {
    let mut wb = workbook();
    wb.set_cell(0, "A1", Value::Number(1.0));
    let clip = wb.capture_clipboard(0, range("A1", "A1"), true).unwrap();
    wb.set_cell(0, "A1", Value::Number(2.0));
    wb.set_cell(0, "B1", Value::Number(9.0));
    assert_eq!(
        wb.paste_clipboard(&clip, 0, &ClipboardPasteOptions::new(range("B1", "B1"))),
        Err("CLIPBOARD_CUT_SOURCE_CHANGED")
    );
    assert_eq!(wb.sheet(0).unwrap().get_cell("B1"), Value::Number(9.0));
    assert_eq!(wb.sheet(0).unwrap().get_cell("A1"), Value::Number(2.0));
}

#[test]
fn partial_range_reference_move_is_rejected_before_source_is_cleared() {
    let mut wb = workbook();
    wb.set_cell(0, "A1", Value::Number(1.0));
    wb.set_formula(0, "C1", "=SUM(A1:A3)");
    let clip = wb.capture_clipboard(0, range("A1", "A1"), true).unwrap();
    assert_eq!(
        wb.paste_clipboard(&clip, 0, &ClipboardPasteOptions::new(range("B1", "B1"))),
        Err("CLIPBOARD_PARTIAL_REFERENCE_MOVE")
    );
    assert_eq!(wb.sheet(0).unwrap().get_cell("A1"), Value::Number(1.0));
}

#[test]
fn tsv_handles_quotes_newlines_empty_cells_types_and_literal_formula_text() {
    let mut wb = workbook();
    let clip = ClipboardSnapshot::from_tsv(
        "1\ttrue\t\"two\nlines\"\r\n'001\t'=A1\t\"a\"\"b\"\n",
        ClipboardPasteMode::All,
    )
    .unwrap();
    assert_eq!((clip.rows(), clip.cols()), (2, 3));
    wb.paste_clipboard(&clip, 0, &ClipboardPasteOptions::new(range("A1", "A1")))
        .unwrap();
    let sheet = wb.sheet(0).unwrap();
    assert_eq!(sheet.get_cell("A1"), Value::Number(1.0));
    assert_eq!(sheet.get_cell("B1"), Value::Boolean(true));
    assert_eq!(sheet.get_cell("C1"), Value::Text("two\nlines".into()));
    assert_eq!(sheet.get_cell("A2"), Value::Text("001".into()));
    assert_eq!(sheet.get_cell("B2"), Value::Text("=A1".into()));
    assert_eq!(sheet.get_cell("C2"), Value::Text("a\"b".into()));
}

#[test]
fn external_formula_is_not_shifted_and_external_text_keeps_target_format() {
    let mut wb = workbook();
    wb.set_cell(0, "A1", Value::Number(7.0));
    wb.sheet_mut(0).unwrap().patch_format_range(
        range("B2", "B2"),
        StyleScope::Cell,
        CellStyle {
            italic: Some(true),
            ..Default::default()
        },
    );
    let clip = ClipboardSnapshot::from_tsv("=A1*2", ClipboardPasteMode::All).unwrap();
    wb.paste_clipboard(&clip, 0, &ClipboardPasteOptions::new(range("B2", "B2")))
        .unwrap();
    assert_eq!(wb.sheet(0).unwrap().get_cell("B2"), Value::Number(14.0));
    assert!(wb.sheet(0).unwrap().effective_format("B2").italic);
}

#[test]
fn invalid_input_and_bounds_reject_before_writes() {
    assert_eq!(
        ClipboardSnapshot::from_tsv("\"unfinished", ClipboardPasteMode::All).unwrap_err(),
        "CLIPBOARD_INVALID_TSV"
    );
    assert_eq!(
        ClipboardSnapshot::from_tsv("=SUM(", ClipboardPasteMode::All).unwrap_err(),
        "CLIPBOARD_INVALID_FORMULA"
    );
    let mut wb = workbook();
    assert_eq!(
        wb.capture_clipboard(0, range("A1", "XFD1048576"), false)
            .unwrap_err(),
        "CLIPBOARD_TOO_LARGE"
    );
    let clip = ClipboardSnapshot::from_tsv("1\t2", ClipboardPasteMode::All).unwrap();
    assert_eq!(
        wb.paste_clipboard(&clip, 0, &ClipboardPasteOptions::new(range("XFD1", "XFD1"))),
        Err("CLIPBOARD_INVALID_RANGE")
    );
    assert_eq!(wb.sheet(0).unwrap().get_cell("XFD1"), Value::Null);
}

#[test]
fn blank_cells_in_snapshot_erase_target_content() {
    let mut wb = workbook();
    wb.set_cell(0, "B2", Value::Number(5.0));
    let clip = wb.capture_clipboard(0, range("A1", "B1"), false).unwrap();
    wb.paste_clipboard(&clip, 0, &ClipboardPasteOptions::new(range("A2", "A2")))
        .unwrap();
    assert_eq!(wb.sheet(0).unwrap().get_cell("B2"), Value::Null);
}

#[test]
fn destination_guard_checks_every_pasted_cell_and_cut_source() {
    let mut wb = workbook();
    let clip = ClipboardSnapshot::from_tsv("1\t2", ClipboardPasteMode::All).unwrap();
    assert_eq!(
        validate(&clip, addr("A1"), 10, 10, Some(&[range("A1", "A1")])),
        Err("CLIPBOARD_LOCKED")
    );
    assert!(validate(
        &clip,
        addr("A1"),
        10,
        10,
        Some(&[range("A1", "A1"), range("B1", "B1")])
    )
    .is_ok());
    assert_eq!(
        validate(&clip, addr("J1"), 10, 10, None),
        Err("CLIPBOARD_OUTSIDE_SHEET")
    );
    wb.set_cell(0, "A1", Value::Number(1.0));
    let cut = wb.capture_clipboard(0, range("A1", "A1"), true).unwrap();
    assert_eq!(
        validate(&cut, addr("B1"), 10, 10, Some(&[range("B1", "B1")])),
        Err("CLIPBOARD_LOCKED")
    );
}

#[test]
fn spill_destination_rejection_does_not_clear_cut_source() {
    let mut wb = workbook();
    wb.set_cell(0, "A1", Value::Number(1.0));
    wb.set_formula(0, "C1", "=SEQUENCE(2)");
    wb.sheet(0).unwrap().get_cell("C1");
    let clip = wb.capture_clipboard(0, range("A1", "A1"), true).unwrap();
    assert_eq!(
        wb.paste_clipboard(&clip, 0, &ClipboardPasteOptions::new(range("C2", "C2"))),
        Err("CLIPBOARD_SPILL_TARGET")
    );
    assert_eq!(wb.sheet(0).unwrap().get_cell("A1"), Value::Number(1.0));
}

fn validate(
    clip: &ClipboardSnapshot,
    target: CellAddress,
    rows: u32,
    cols: u32,
    unlocked: Option<&[CellRange]>,
) -> Result<(), ClipboardError> {
    let mut options = ClipboardPasteOptions::new(CellRange::single(target));
    options.row_count = rows;
    options.col_count = cols;
    options.unlocked_ranges = unlocked.map(|ranges| ranges.to_vec());
    clip.paste_target(&options, None).map(|_| ())
}
