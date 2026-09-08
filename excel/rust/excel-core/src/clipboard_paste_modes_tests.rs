use super::*;
use crate::{CellStyle, StyleScope};

fn range(start: &str, end: &str) -> CellRange {
    CellRange::new(
        CellAddress::parse(start).unwrap(),
        CellAddress::parse(end).unwrap(),
    )
}

fn options(start: &str, end: &str, mode: ClipboardPasteMode) -> ClipboardPasteOptions {
    ClipboardPasteOptions {
        mode,
        ..ClipboardPasteOptions::new(range(start, end))
    }
}

#[test]
fn values_paste_freezes_formula_result_and_preserves_destination_style() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(125.02));
    wb.set_formula(0, "B1", "=A1*2");
    wb.sheet_mut(0).unwrap().patch_format_range(
        range("B1", "B1"),
        StyleScope::Cell,
        CellStyle {
            bold: Some(true),
            ..Default::default()
        },
    );
    wb.sheet_mut(0).unwrap().patch_format_range(
        range("D1", "D1"),
        StyleScope::Cell,
        CellStyle {
            italic: Some(true),
            ..Default::default()
        },
    );
    let clip = wb.capture_clipboard(0, range("B1", "B1"), false).unwrap();
    wb.set_cell(0, "A1", Value::Number(100.0));
    wb.paste_clipboard(&clip, 0, &options("D1", "D1", ClipboardPasteMode::Values))
        .unwrap();
    let sheet = wb.sheet(0).unwrap();
    assert_eq!(sheet.get_cell("D1"), Value::Number(250.04));
    assert_eq!(sheet.get_formula("D1"), None);
    assert!(!sheet.get_format("D1").bold);
    assert!(sheet.get_format("D1").italic);
}

#[test]
fn values_paste_preserves_raw_number_not_rounded_display_text() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(125.02));
    wb.sheet_mut(0).unwrap().patch_format_range(
        range("A1", "A1"),
        StyleScope::Cell,
        CellStyle {
            number_format: Some(crate::NumberFormat::Decimal {
                digits: 0,
                thousands: false,
            }),
            ..Default::default()
        },
    );
    let clip = wb.capture_clipboard(0, range("A1", "A1"), false).unwrap();
    assert_eq!(clip.text(), "125");
    wb.paste_clipboard(&clip, 0, &options("B1", "B1", ClipboardPasteMode::Values))
        .unwrap();
    assert_eq!(wb.sheet(0).unwrap().get_cell("B1"), Value::Number(125.02));
}

#[test]
fn format_paste_does_not_write_or_evaluate_destination_formula() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(3.0));
    wb.set_formula(0, "B1", "=A1*2");
    wb.sheet_mut(0).unwrap().patch_format_range(
        range("A1", "A1"),
        StyleScope::Cell,
        CellStyle {
            bold: Some(true),
            ..Default::default()
        },
    );
    let clip = wb.capture_clipboard(0, range("A1", "A1"), false).unwrap();
    let before = wb.sheet(0).unwrap().debug_formula_eval_count();
    wb.paste_clipboard(&clip, 0, &options("B1", "B1", ClipboardPasteMode::Formats))
        .unwrap();
    let sheet = wb.sheet(0).unwrap();
    assert_eq!(sheet.debug_formula_eval_count(), before);
    assert_eq!(sheet.get_formula("B1").as_deref(), Some("=A1*2"));
    assert_eq!(sheet.get_cell("B1"), Value::Number(6.0));
    assert!(sheet.get_format("B1").bold);
}

#[test]
fn format_paste_overrides_inherited_styles_and_keeps_spill_results() {
    let mut wb = Workbook::new();
    wb.sheet_mut(0).unwrap().patch_format_range(
        range("A2", "C2"),
        StyleScope::Row,
        CellStyle {
            bold: Some(true),
            ..Default::default()
        },
    );
    wb.set_formula(0, "B1", "=SEQUENCE(2)");
    wb.sheet(0).unwrap().get_cell("B1");
    let clip = wb.capture_clipboard(0, range("A1", "A1"), false).unwrap();
    wb.paste_clipboard(&clip, 0, &options("B2", "B2", ClipboardPasteMode::Formats))
        .unwrap();
    assert!(!wb.sheet(0).unwrap().get_format("B2").bold);
    assert!(wb.sheet(0).unwrap().get_format("A2").bold);
    assert_eq!(wb.sheet(0).unwrap().get_cell("B2"), Value::Number(2.0));
}

#[test]
fn tiles_values_and_shifts_each_formula_from_its_own_origin() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(2.0));
    wb.set_formula(0, "B1", "=A1*2");
    let clip = wb.capture_clipboard(0, range("A1", "B1"), false).unwrap();
    assert_eq!(
        wb.paste_clipboard(&clip, 0, &options("A2", "D3", ClipboardPasteMode::All))
            .unwrap(),
        range("A2", "D3")
    );
    let sheet = wb.sheet(0).unwrap();
    for row in 2..=3 {
        for col in ["A", "C"] {
            assert_eq!(sheet.get_cell(&format!("{col}{row}")), Value::Number(2.0));
        }
        for col in ["B", "D"] {
            assert_eq!(sheet.get_cell(&format!("{col}{row}")), Value::Number(4.0));
        }
    }
    assert_eq!(sheet.get_formula("D3").as_deref(), Some("=(C3*2)"));
}

#[test]
fn non_multiple_selection_is_rejected_without_partial_writes() {
    let mut wb = Workbook::new();
    let clip = ClipboardSnapshot::from_tsv("1\t2", ClipboardPasteMode::All).unwrap();
    wb.set_cell(0, "A2", Value::Number(99.0));
    assert_eq!(
        wb.paste_clipboard(&clip, 0, &options("A2", "C2", ClipboardPasteMode::All)),
        Err("CLIPBOARD_SELECTION_SIZE")
    );
    assert_eq!(wb.sheet(0).unwrap().get_cell("A2"), Value::Number(99.0));
    assert_eq!(wb.sheet(0).unwrap().get_cell("B2"), Value::Null);
}

#[test]
fn cut_rejects_special_paste_or_repetition_then_still_allows_normal_move() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(5.0));
    let clip = wb.capture_clipboard(0, range("A1", "A1"), true).unwrap();
    for mode in [ClipboardPasteMode::Values, ClipboardPasteMode::Formats] {
        assert_eq!(
            wb.paste_clipboard(&clip, 0, &options("B1", "B1", mode)),
            Err("CLIPBOARD_CUT_SPECIAL")
        );
    }
    assert_eq!(
        wb.paste_clipboard(&clip, 0, &options("B1", "C1", ClipboardPasteMode::All)),
        Err("CLIPBOARD_SELECTION_SIZE")
    );
    assert_eq!(wb.sheet(0).unwrap().get_cell("A1"), Value::Number(5.0));
    wb.paste_clipboard(&clip, 0, &options("B1", "B1", ClipboardPasteMode::All))
        .unwrap();
    assert_eq!(wb.sheet(0).unwrap().get_cell("A1"), Value::Null);
}

#[test]
fn external_value_paste_does_not_evaluate_formula_text_and_has_no_styles() {
    let mut wb = Workbook::new();
    let clip = ClipboardSnapshot::from_tsv("=SUM(\t7", ClipboardPasteMode::Values).unwrap();
    wb.paste_clipboard(&clip, 0, &options("A1", "B2", ClipboardPasteMode::Values))
        .unwrap();
    assert_eq!(
        wb.sheet(0).unwrap().get_cell("A2"),
        Value::Text("=SUM(".into())
    );
    assert_eq!(wb.sheet(0).unwrap().get_cell("B2"), Value::Number(7.0));
    assert_eq!(
        ClipboardSnapshot::from_tsv("text", ClipboardPasteMode::Formats).unwrap_err(),
        "CLIPBOARD_NO_FORMATS"
    );
}

#[test]
fn protection_gate_checks_all_repeated_cells_not_just_the_first_tile() {
    let mut wb = Workbook::new();
    let clip = ClipboardSnapshot::from_tsv("7", ClipboardPasteMode::All).unwrap();
    let mut target = options("A1", "B2", ClipboardPasteMode::All);
    target.unlocked_ranges = Some(vec![range("A1", "B1")]);
    assert_eq!(
        wb.paste_clipboard(&clip, 0, &target),
        Err("CLIPBOARD_LOCKED")
    );
    assert_eq!(wb.sheet(0).unwrap().get_cell("A1"), Value::Null);
}

#[test]
fn cut_formula_uses_current_dependencies_without_rejecting_its_frozen_result() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(2.0));
    wb.set_formula(0, "B1", "=A1*2");
    let clip = wb.capture_clipboard(0, range("B1", "B1"), true).unwrap();
    wb.set_cell(0, "A1", Value::Number(3.0));
    wb.paste_clipboard(&clip, 0, &options("C1", "C1", ClipboardPasteMode::All))
        .unwrap();
    assert_eq!(wb.sheet(0).unwrap().get_cell("C1"), Value::Number(6.0));
    assert_eq!(wb.sheet(0).unwrap().get_cell("B1"), Value::Null);
}

#[test]
fn cut_back_onto_itself_does_not_retarget_partial_range_references() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(2.0));
    wb.set_formula(0, "C1", "=SUM(A1:A2)");
    let clip = wb.capture_clipboard(0, range("A1", "A1"), true).unwrap();
    wb.paste_clipboard(&clip, 0, &options("A1", "A1", ClipboardPasteMode::All))
        .unwrap();
    assert_eq!(wb.sheet(0).unwrap().get_cell("C1"), Value::Number(2.0));
    assert_eq!(
        wb.sheet(0).unwrap().get_formula("C1").as_deref(),
        Some("=SUM(A1:A2)")
    );
}
