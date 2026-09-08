//! 选择公式/计算结果时，只携带选定的数字格式，不覆盖目标其他样式。
use super::*;
use crate::{CellStyle, NumberFormat, StyleScope};

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

fn seed() -> Workbook {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(125.02));
    wb.set_formula(0, "B1", "=A1*2");
    let sheet = wb.sheet_mut(0).unwrap();
    sheet.patch_format_range(
        range("B1", "B1"),
        StyleScope::Cell,
        CellStyle {
            bold: Some(true),
            color: Some(Some("#c00000".into())),
            number_format: Some(NumberFormat::Decimal {
                digits: 0,
                thousands: false,
            }),
            ..Default::default()
        },
    );
    sheet.patch_format_range(
        range("A2", "F2"),
        StyleScope::Row,
        CellStyle {
            italic: Some(true),
            background: Some(Some("#fff2cc".into())),
            number_format: Some(NumberFormat::Percent { digits: 2 }),
            ..Default::default()
        },
    );
    wb
}

#[test]
fn formulas_only_shifts_references_and_preserves_every_target_style() {
    let mut wb = seed();
    let clip = wb.capture_clipboard(0, range("A1", "B1"), false).unwrap();
    let before = wb.sheet(0).unwrap().get_format("B2");
    wb.paste_clipboard(&clip, 0, &options("A2", "D2", ClipboardPasteMode::Formulas))
        .unwrap();
    let sheet = wb.sheet(0).unwrap();
    assert_eq!(sheet.get_cell("A2"), Value::Number(125.02));
    assert_eq!(sheet.get_cell("D2"), Value::Number(250.04));
    assert_eq!(sheet.get_formula("D2").as_deref(), Some("=(C2*2)"));
    assert_eq!(sheet.get_format("B2"), before);
    assert_eq!(sheet.get_format("D2"), before);
}

#[test]
fn formulas_and_number_formats_copies_only_number_format_and_keeps_live_formula() {
    let mut wb = seed();
    let clip = wb.capture_clipboard(0, range("A1", "B1"), false).unwrap();
    wb.paste_clipboard(
        &clip,
        0,
        &options("A2", "B2", ClipboardPasteMode::FormulasAndNumberFormats),
    )
    .unwrap();
    let sheet = wb.sheet(0).unwrap();
    assert_eq!(sheet.formatted_display("A2"), "125.02");
    assert_eq!(sheet.formatted_display("B2"), "250");
    let format = sheet.get_format("B2");
    assert!(format.italic);
    assert!(!format.bold);
    assert_eq!(format.background.as_deref(), Some("#fff2cc"));
    assert_ne!(format.color.as_deref(), Some("#c00000"));
    wb.set_cell(0, "A2", Value::Number(10.0));
    assert_eq!(wb.sheet(0).unwrap().get_cell("B2"), Value::Number(20.0));
}

#[test]
fn values_and_number_formats_freezes_raw_result_and_source_format_at_copy_time() {
    let mut wb = seed();
    let clip = wb.capture_clipboard(0, range("B1", "B1"), false).unwrap();
    wb.set_cell(0, "A1", Value::Number(999.0));
    wb.sheet_mut(0).unwrap().patch_format_range(
        range("B1", "B1"),
        StyleScope::Cell,
        CellStyle {
            number_format: Some(NumberFormat::Percent { digits: 2 }),
            ..Default::default()
        },
    );
    wb.paste_clipboard(
        &clip,
        0,
        &options("B2", "B2", ClipboardPasteMode::ValuesAndNumberFormats),
    )
    .unwrap();
    let sheet = wb.sheet(0).unwrap();
    assert_eq!(sheet.get_cell("B2"), Value::Number(250.04));
    assert_eq!(sheet.get_formula("B2"), None);
    assert_eq!(sheet.formatted_display("B2"), "250");
    assert!(sheet.get_format("B2").italic);
    assert!(!sheet.get_format("B2").bold);
    assert_eq!(sheet.get_format("B2").background.as_deref(), Some("#fff2cc"));
}

#[test]
fn number_format_modes_do_not_create_cell_overrides_for_inherited_fonts() {
    let mut wb = seed();
    let clip = wb.capture_clipboard(0, range("B1", "B1"), false).unwrap();
    for mode in [
        ClipboardPasteMode::FormulasAndNumberFormats,
        ClipboardPasteMode::ValuesAndNumberFormats,
    ] {
        wb.paste_clipboard(&clip, 0, &options("D2", "D2", mode))
            .unwrap();
        let sheet = wb.sheet(0).unwrap();
        let style = sheet
            .cell_styles
            .get(&CellAddress::parse("D2").unwrap())
            .unwrap();
        assert!(style.number_format.is_some());
        assert_eq!(style.italic, None);
        assert_eq!(style.bold, None);
        assert_eq!(style.background, None);
    }
}

#[test]
fn external_formulas_keep_written_references_but_number_format_modes_require_a_snapshot() {
    let mut wb = seed();
    let clip =
        ClipboardSnapshot::from_tsv("=A1*3\t'00123\tfalse", ClipboardPasteMode::Formulas).unwrap();
    wb.paste_clipboard(&clip, 0, &options("B2", "B2", ClipboardPasteMode::Formulas))
        .unwrap();
    let sheet = wb.sheet(0).unwrap();
    assert_eq!(sheet.get_formula("B2").as_deref(), Some("=A1*3"));
    assert_eq!(sheet.get_cell("C2"), Value::Text("00123".into()));
    assert_eq!(sheet.get_cell("D2"), Value::Boolean(false));
    assert!(sheet.get_format("B2").italic);
    for mode in [
        ClipboardPasteMode::FormulasAndNumberFormats,
        ClipboardPasteMode::ValuesAndNumberFormats,
    ] {
        assert_eq!(
            ClipboardSnapshot::from_tsv("7", mode).unwrap_err(),
            "CLIPBOARD_NO_FORMATS"
        );
    }
    assert_eq!(
        ClipboardSnapshot::from_tsv("=SUM(", ClipboardPasteMode::Formulas).unwrap_err(),
        "CLIPBOARD_INVALID_FORMULA"
    );
}

#[test]
fn new_modes_preflight_all_targets_before_writing_any_values_or_formats() {
    for mode in [
        ClipboardPasteMode::Formulas,
        ClipboardPasteMode::FormulasAndNumberFormats,
        ClipboardPasteMode::ValuesAndNumberFormats,
    ] {
        let mut wb = seed();
        let clip = wb.capture_clipboard(0, range("A1", "B1"), false).unwrap();
        wb.set_cell(0, "A2", Value::Number(77.0));
        let before = wb.sheet(0).unwrap().get_format("A2");
        let mut target = options("A2", "A2", mode);
        target.unlocked_ranges = Some(vec![range("A2", "A2")]);
        assert_eq!(
            wb.paste_clipboard(&clip, 0, &target),
            Err("CLIPBOARD_LOCKED")
        );
        target.unlocked_ranges = None;
        wb.set_formula(0, "B2", "=SEQUENCE(2)");
        wb.sheet(0).unwrap().get_cell("B2");
        assert_eq!(
            wb.paste_clipboard(&clip, 0, &target),
            Err("CLIPBOARD_SPILL_TARGET")
        );
        assert_eq!(wb.sheet(0).unwrap().get_cell("A2"), Value::Number(77.0));
        assert_eq!(wb.sheet(0).unwrap().get_format("A2"), before);
    }
}

#[test]
fn transpose_and_skip_blanks_apply_to_the_new_modes_without_losing_target_style() {
    let mut wb = seed();
    wb.set_formula(0, "B1", "=$A$1*2");
    let clip = wb.capture_clipboard(0, range("B1", "C1"), false).unwrap();
    for mode in [
        ClipboardPasteMode::Formulas,
        ClipboardPasteMode::FormulasAndNumberFormats,
        ClipboardPasteMode::ValuesAndNumberFormats,
    ] {
        wb.set_cell(0, "D3", Value::Number(99.0));
        let mut target = options("D2", "D2", mode);
        target.transpose = true;
        target.skip_blanks = true;
        wb.paste_clipboard(&clip, 0, &target).unwrap();
        let sheet = wb.sheet(0).unwrap();
        assert_eq!(sheet.get_cell("D2"), Value::Number(250.04));
        assert_eq!(sheet.get_cell("D3"), Value::Number(99.0));
        assert!(sheet.get_format("D2").italic);
        assert_eq!(
            sheet.get_formula("D2").is_some(),
            mode != ClipboardPasteMode::ValuesAndNumberFormats
        );
    }
}
