use einfach_core::Value;
use einfach_excel_core::cell_input::{editable_cell_text, parse_cell_input, CellInput};
use einfach_excel_core::{CellAddress, CellRange, CellStyle, NumberFormat, StyleScope, Workbook};

#[test]
fn clock_elapsed_and_am_pm_are_numeric_days_with_native_display() {
    let mut wb = Workbook::new();
    for (input, seconds, display) in [
        ("0:00", 0, "0:00"),
        (" 06:30 ", 23400, "6:30"),
        ("23:59:59", 86399, "23:59:59"),
        ("24:00", 86400, "24:00:00"),
        ("36:15:30", 130530, "36:15:30"),
        ("12 AM", 0, "12:00 AM"),
        ("12:00 PM", 43200, "12:00 PM"),
        ("1:30 pm", 48600, "1:30 PM"),
        ("9 a", 32400, "9:00 AM"),
        ("9:05:01 P", 75901, "9:05:01 PM"),
    ] {
        wb.set_cell_input(0, "A1", input).unwrap();
        assert_eq!(
            wb.get_cell("Sheet1", "A1"),
            Value::Number(seconds as f64 / 86400.0),
            "{input}"
        );
        assert_eq!(
            wb.sheet(0).unwrap().formatted_display("A1"),
            display,
            "{input}"
        );
        wb.set_cell_input(0, "B1", "=ROUND(A1*86400,0)").unwrap();
        assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(seconds as f64));
    }
}

#[test]
fn mixed_fractions_preserve_denominator_and_whole_number_sign() {
    let mut wb = Workbook::new();
    for (input, value, display) in [
        ("1 1/2", 1.5, "1 1/2"),
        ("0 2/8", 0.25, "2/8"),
        ("-0 3/8", -0.375, "-3/8"),
        ("-2 1/4", -2.25, "-2 1/4"),
        ("+2  1/4", 2.25, "2 1/4"),
        ("0 7/4", 1.75, "1 3/4"),
        ("3 0/8", 3.0, "3"),
        ("0 1/1000", 0.001, "1/1000"),
    ] {
        wb.set_cell_input(0, "A1", input).unwrap();
        assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(value), "{input}");
        assert_eq!(
            wb.sheet(0).unwrap().formatted_display("A1"),
            display,
            "{input}"
        );
        wb.set_cell_input(0, "B1", "=A1*2").unwrap();
        assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(value * 2.0));
    }
}

#[test]
fn invalid_ambiguous_and_escaped_inputs_remain_text() {
    for text in [
        "1/2",
        "1 1/0",
        "1 -1/2",
        "1 1/-2",
        "1.5 1/2",
        "1 1.5/2",
        "1 1/4294967296",
        "1 1/2/3",
        "1\n1/2",
        "1\t1/2",
        "13:60",
        "1:00:60",
        "1:2",
        "1::00",
        "1:00:",
        "-1:00",
        "+1:00",
        "0:00 AM",
        "13:00 PM",
        "1:00 XM",
        "1:00PM",
        "1:00:00:00",
        "9.5 AM",
        "71003184:00",
        "999999999999999999999:00",
        "1:00:00.5",
    ] {
        assert_eq!(
            parse_cell_input(text, true),
            CellInput::Literal(Value::Text(text.into())),
            "{text}"
        );
    }
    for text in ["13:30", "36:00", "12 AM", "9:00 p", "1 1/2", "-0 3/8"] {
        let value = Value::Text(text.into());
        assert_eq!(
            parse_cell_input(&format!("'{text}"), true),
            CellInput::Literal(value.clone())
        );
        assert_eq!(
            parse_cell_input(&editable_cell_text(&value, ""), true),
            CellInput::Literal(value)
        );
    }
}

#[test]
fn input_changes_only_target_number_format_and_numeric_reedit_preserves_it() {
    let mut wb = Workbook::new();
    wb.sheet_mut(0).unwrap().patch_format_range(
        CellRange::single(CellAddress::new(0, 0)),
        StyleScope::Row,
        CellStyle {
            bold: Some(true),
            ..Default::default()
        },
    );
    for input in ["13:30", "1:30 PM", "1 1/2"] {
        wb.set_cell_input(0, "A1", input).unwrap();
        let value = wb.get_cell("Sheet1", "A1");
        let format = wb.sheet(0).unwrap().get_format("A1");
        assert!(format.bold);
        assert_eq!(
            wb.sheet(0).unwrap().get_format("B1").number_format,
            NumberFormat::General
        );
        wb.set_cell_input(0, "A1", &editable_cell_text(&value, ""))
            .unwrap();
        assert_eq!(wb.sheet(0).unwrap().get_format("A1"), format);
        assert_eq!(wb.get_cell("Sheet1", "A1"), value);
    }
}

#[test]
fn external_tsv_shares_numeric_parser_without_changing_target_style() {
    use einfach_excel_core::clipboard::{
        ClipboardPasteMode, ClipboardPasteOptions, ClipboardSnapshot,
    };
    for mode in [ClipboardPasteMode::All, ClipboardPasteMode::Values] {
        let mut wb = Workbook::new();
        wb.set_cell_input(0, "A1", "25%").unwrap();
        let clip = ClipboardSnapshot::from_tsv("12:00\t12:00 PM\t1 1/2\t'1 1/2", mode).unwrap();
        wb.paste_clipboard(
            &clip,
            0,
            &ClipboardPasteOptions::new(CellRange::single(CellAddress::new(0, 0))),
        )
        .unwrap();
        assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(0.5));
        assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(0.5));
        assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(1.5));
        assert_eq!(wb.get_cell("Sheet1", "D1"), Value::Text("1 1/2".into()));
        assert_eq!(wb.sheet(0).unwrap().formatted_display("A1"), "50%");
        assert_eq!(
            wb.sheet(0).unwrap().get_format("B1").number_format,
            NumberFormat::General
        );
    }
}
