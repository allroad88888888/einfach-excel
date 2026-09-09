use einfach_core::Value;
use einfach_excel_core::cell_input::{editable_cell_text, parse_cell_input, CellInput};
use einfach_excel_core::{
    CellAddress, CellFormat, CellRange, CellStyle, NumberFormat, StyleScope, Workbook,
};

#[test]
fn explicit_date_input_installs_native_value_and_only_date_format() {
    let mut wb = Workbook::new();
    wb.sheet_mut(0).unwrap().patch_format_range(
        CellRange::single(CellAddress::new(0, 0)),
        StyleScope::Row,
        CellStyle {
            bold: Some(true),
            ..Default::default()
        },
    );
    wb.set_cell_input(0, "A1", "2024/2/29").unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(45351.0));
    let sheet = wb.sheet(0).unwrap();
    assert_eq!(sheet.formatted_display("A1"), "2024-02-29");
    assert!(sheet.get_format("A1").bold);
    assert_eq!(sheet.get_format("B1").number_format, NumberFormat::General);
    wb.set_cell_input(0, "B1", "=DAY(A1)").unwrap();
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(29.0));
    wb.set_cell_input(0, "A1", "1900-02-29").unwrap();
    assert_eq!(wb.sheet(0).unwrap().formatted_display("A1"), "1900-02-29");
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(60.0));
}

#[test]
fn invalid_ambiguous_and_forced_dates_stay_text_and_reedit_is_lossless() {
    for text in [
        "2023-02-29",
        "02/03/2024",
        "1899-12-31",
        "2024-01-00",
        "2024-13-01",
    ] {
        assert_eq!(
            parse_cell_input(text, true),
            CellInput::Literal(Value::Text(text.into()))
        );
    }
    assert_eq!(
        parse_cell_input("'2024-02-29", true),
        CellInput::Literal(Value::Text("2024-02-29".into()))
    );
    for text in ["2024-02-29", "1900-02-29", "2024/2/29"] {
        let value = Value::Text(text.into());
        assert_eq!(
            parse_cell_input(&editable_cell_text(&value, ""), true),
            CellInput::Literal(value)
        );
    }
    assert_eq!(editable_cell_text(&Value::Number(45351.0), ""), "45351");
}

#[test]
fn date_formats_preserve_compatibility_day_and_do_not_round_the_raw_number() {
    for (pattern, serial, expected) in [
        ("yyyy-mm-dd", 0.0, "1900-01-00"),
        ("yyyy-mm-dd", 59.0, "1900-02-28"),
        ("yyyy-mm-dd", 60.75, "1900-02-29"),
        ("yyyy-mm-dd", 61.0, "1900-03-01"),
        ("yyyy/m/d", 25569.0, "1970/1/1"),
        ("dd-mmm-yy", 45351.0, "29-Feb-24"),
        ("dddd, mmmm d, yyyy", 45292.0, "Monday, January 1, 2024"),
        ("yyyy-mm-dd", -1.0, "#####"),
        ("yyyy-mm-dd", 2958466.0, "#####"),
    ] {
        let f = CellFormat {
            number_format: NumberFormat::Date(pattern.into()),
            ..Default::default()
        };
        assert_eq!(f.format_number(serial), expected, "{pattern} {serial}");
    }
}

#[test]
fn external_tsv_recognizes_date_serial_but_retains_target_format() {
    use einfach_excel_core::clipboard::{
        ClipboardPasteMode, ClipboardPasteOptions, ClipboardSnapshot,
    };
    let mut wb = Workbook::new();
    let clip =
        ClipboardSnapshot::from_tsv("2024-02-29\t'2024-02-29", ClipboardPasteMode::All).unwrap();
    wb.paste_clipboard(
        &clip,
        0,
        &ClipboardPasteOptions::new(CellRange::single(CellAddress::new(0, 0))),
    )
    .unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(45351.0));
    assert_eq!(
        wb.get_cell("Sheet1", "B1"),
        Value::Text("2024-02-29".into())
    );
    assert_eq!(
        wb.sheet(0).unwrap().get_format("A1").number_format,
        NumberFormat::General
    );
}
