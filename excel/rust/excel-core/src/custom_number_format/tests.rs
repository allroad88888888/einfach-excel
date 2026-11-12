//! 自定义数字格式：段、条件、颜色、字面量、填充、缩放、文本段、日期时间与校验。
use super::*;
use crate::format::{CellFormat, NumberFormat};

fn text(pattern: &str, n: f64) -> String {
    format_number(pattern, n).expect(pattern).text
}

fn shown(pattern: &str, n: f64) -> CustomFormatted {
    format_number(pattern, n).expect(pattern)
}

mod cell_format {
    use super::*;

    #[test]
    fn custom_number_format_literals_scaling_and_bracket_tags() {
        let f = CellFormat {
            number_format: NumberFormat::Custom("#,##0.00\" kg\"".into()),
            ..Default::default()
        };
        assert_eq!(f.format_number(1234.5), "1,234.50 kg");

        let f = CellFormat {
            number_format: NumberFormat::Custom("#,##0,,".into()),
            ..Default::default()
        };
        assert_eq!(f.format_number(1_234_567_890.0), "1,235");

        let f = CellFormat {
            number_format: NumberFormat::Custom("[Red][$¥-411]#,##0.0".into()),
            ..Default::default()
        };
        assert_eq!(f.format_number(1234.56), "¥1,234.6");
    }

    #[test]
    fn custom_number_format_sections() {
        let f = CellFormat {
            number_format: NumberFormat::Custom("0;[Red](0);\"-\"".into()),
            ..Default::default()
        };
        assert_eq!(f.format_number(12.0), "12");
        assert_eq!(f.format_number(-12.0), "(12)");
        assert_eq!(f.format_number(0.0), "-");
    }
}

#[test]
fn literals_between_digits_follow_placeholder_positions() {
    assert_eq!(text("000-00-0000", 123_456_789.0), "123-45-6789");
    assert_eq!(text("\"Qty: \"0", 42.0), "Qty: 42");
    assert_eq!(text("0\\ \\k\\g", 5.0), "5 kg");
    assert_eq!(text("(000) 000-0000", 5_551_234_567.0), "(555) 123-4567");
    assert_eq!(text("00000", 42.0), "00042");
}

#[test]
fn digit_placeholders_round_pad_and_trim() {
    assert_eq!(text("#,##0.00", 1234.5), "1,234.50");
    assert_eq!(text("#,##0.00", 0.5), "0.50");
    assert_eq!(text("#.##", 0.5), ".5");
    assert_eq!(text("0.0#", 1.5), "1.5");
    assert_eq!(text("0.0#", 1.257), "1.26");
    assert_eq!(text("??0.0?", 1.5), "  1.5 ");
    assert_eq!(text("0", 2.5), "3");
    assert_eq!(text("0", -2.5), "-3");
    assert_eq!(text("#,##0", 1_234_567.0), "1,234,567");
    assert_eq!(text("0.00", -0.001), "0.00");
}

#[test]
fn percent_and_trailing_comma_scaling() {
    assert_eq!(text("0.0%", 0.125), "12.5%");
    assert_eq!(text("#,##0,\"K\"", 12_345.0), "12K");
    assert_eq!(text("#,##0.0,,\"M\"", 1_250_000.0), "1.3M");
    assert_eq!(text("0,", 999.0), "1");
}

#[test]
fn scientific_codes() {
    assert_eq!(text("0.00E+00", 12345.0), "1.23E+04");
    assert_eq!(text("0.00E+00", 0.000123), "1.23E-04");
    assert_eq!(text("##0.0E+0", 12345.0), "12.3E+3");
    assert_eq!(text("0.0E-0", 1500.0), "1.5E3");
    assert_eq!(text("0.00E+00", 9.999), "1.00E+01");
}

#[test]
fn sections_pick_sign_and_zero() {
    let code = "#,##0.00;[Red](#,##0.00)";
    assert_eq!(shown(code, 1234.5),
        CustomFormatted { text: "1,234.50".into(), color: None, fill: None, pads: Vec::new() });
    assert_eq!(shown(code, -1234.5).text, "(1,234.50)");
    assert_eq!(shown(code, -1234.5).color.as_deref(), Some("#ff0000"));
    assert_eq!(text(code, 0.0), "0.00");
    assert_eq!(text("0;-0;\"zero\";@", 0.0), "zero");
    assert_eq!(text("0;;", 0.0), "");
    assert_eq!(text("0;;", -5.0), "");
    assert_eq!(text("0", -5.0), "-5");
}

#[test]
fn conditions_choose_sections() {
    let code = "[>=1000000]0.0,,\"M\";[>=1000]0.0,\"K\";0";
    assert_eq!(text(code, 2_500_000.0), "2.5M");
    assert_eq!(text(code, 2_500.0), "2.5K");
    assert_eq!(text(code, 25.0), "25");
    assert_eq!(text("[<=9999999]###-####;(###) ###-####", 5_551_234.0), "555-1234");
    assert_eq!(text("[<=9999999]###-####;(###) ###-####", 5_551_234_567.0), "(555) 123-4567");
    let colored = "[Red][<=100]0;[Blue][>100]0";
    assert_eq!(shown(colored, 50.0).color.as_deref(), Some("#ff0000"));
    assert_eq!(shown(colored, 150.0).color.as_deref(), Some("#0000ff"));
    assert_eq!(text("[>=100]0;0", -5.0), "-5");
}

#[test]
fn colors_named_and_indexed() {
    for (tag, hex) in [
        ("Black", "#000000"), ("White", "#ffffff"), ("Red", "#ff0000"), ("Green", "#00ff00"),
        ("Blue", "#0000ff"), ("Yellow", "#ffff00"), ("Magenta", "#ff00ff"), ("Cyan", "#00ffff"),
        ("Color10", "#008000"), ("color56", "#333333"),
    ] {
        assert_eq!(shown(&format!("[{tag}]0"), 1.0).color.as_deref(), Some(hex), "{tag}");
    }
    assert_eq!(validate("[Color57]0"), Err(CustomFormatError::UnknownBracket));
}

#[test]
fn currency_and_locale_tags() {
    assert_eq!(text("[$¥-411]#,##0", 1234.0), "¥1,234");
    assert_eq!(text("[$-409]0.0", 1.25), "1.3");
    assert_eq!(text("[$USD] 0", 3.0), "USD 3");
}

#[test]
fn padding_and_fill_marks() {
    let accounting = shown("_($* #,##0.00_)", 1234.5);
    assert_eq!(accounting.text, " $1,234.50 ");
    assert_eq!(accounting.fill, Some(CharMark { ch: ' ', at: 2 }));
    let dashes = shown("0*-", 7.0);
    assert_eq!((dashes.text.as_str(), dashes.fill), ("7", Some(CharMark { ch: '-', at: 1 })));
    assert_eq!(shown("*.0", -7.0).fill, Some(CharMark { ch: '.', at: 1 }));
}

#[test]
fn text_section_and_placeholder() {
    let code = "0.00;-0.00;0;[Blue]\"Note: \"@";
    let note = format_text(code, "late").unwrap();
    assert_eq!((note.text.as_str(), note.color.as_deref()), ("Note: late", Some("#0000ff")));
    assert_eq!(format_text("0;-0;0;", "hidden").unwrap().text, "");
    assert_eq!(format_text("\"[\"@\"]\"", "x").unwrap().text, "[x]");
    assert_eq!(format_text("0.00", "plain"), None);
    assert_eq!(text("0;-0;0;@", 3.0), "3");
}

#[test]
fn general_inside_custom() {
    assert_eq!(text("\"Total: \"General", 12.5), "Total: 12.5");
    assert_eq!(text("General;[Red]-General", -3.0), "-3");
}

#[test]
fn date_and_time_codes() {
    // 45306.75 = 2024-01-15 18:00
    assert_eq!(text("yyyy-mm-dd hh:mm", 45306.75), "2024-01-15 18:00");
    assert_eq!(text("[h]:mm", 1.5), "36:00");
    assert_eq!(text("h:mm AM/PM", 0.75), "6:00 PM");
    assert_eq!(text("dddd, mmmm d", 45306.0), "Monday, January 15");
    assert_eq!(text("mm:ss.00", 1.0 / 86_400.0 * 61.25), "01:01.25");
    assert_eq!(text("hh:mm:ss", 0.999_999_9), "00:00:00");
    assert_eq!(text("[Blue]yyyy", 45306.0), "2024");
    assert_eq!(shown("[Blue]yyyy", 45306.0).color.as_deref(), Some("#0000ff"));
    assert_eq!(text("yyyy", -1.0), "#####");
}

#[test]
fn validation_reports_typed_errors() {
    assert_eq!(validate("0.00"), Ok(()));
    assert_eq!(validate("_($* #,##0.00_);_($* (#,##0.00);_($* \"-\"??_);_(@_)"), Ok(()));
    assert_eq!(validate(""), Err(CustomFormatError::Empty));
    assert_eq!(validate("\"abc"), Err(CustomFormatError::UnclosedQuote));
    assert_eq!(validate("0;0;0;@;0"), Err(CustomFormatError::TooManySections));
    assert_eq!(validate("0.0.0"), Err(CustomFormatError::MultipleDecimalPoints));
    assert_eq!(validate("[Red0"), Err(CustomFormatError::UnclosedBracket));
    assert_eq!(validate("[Purple]0"), Err(CustomFormatError::UnknownBracket));
    assert_eq!(validate("0\\"), Err(CustomFormatError::IncompleteEscape));
    assert_eq!(validate("0@"), Err(CustomFormatError::TextWithDigits));
    assert_eq!(validate(&"0".repeat(256)), Err(CustomFormatError::TooLong));
    assert_eq!(validate("\"a;b\"0;[Red]0"), Ok(()));
    assert_eq!(CustomFormatError::MultipleDecimalPoints.code(), "multiple-decimal-points");
    assert!(format_number("0.0.0", 1.0).is_none());
}

#[test]
fn underscore_pads_record_the_character_whose_width_is_reserved() {
    let padded = shown("_W0", 7.0);
    assert_eq!(padded.text, " 7");
    assert_eq!(padded.pads, vec![CharMark { ch: 'W', at: 0 }]);
    let accounting = shown("_($* #,##0.00_)", -0.0 + 1234.5);
    assert_eq!(accounting.pads, vec![CharMark { ch: '(', at: 0 }, CharMark { ch: ')', at: 10 }]);
    let negative = shown("0_);(0)", -5.0);
    assert_eq!((negative.text.as_str(), negative.pads.len()), ("(5)", 0));
    assert_eq!(shown("-0_)", -5.0).pads, vec![CharMark { ch: ')', at: 3 }]);
    assert_eq!(format_text("@_)", "x").unwrap().pads, vec![CharMark { ch: ')', at: 1 }]);
}

#[test]
fn fraction_placeholders() {
    assert_eq!(text("# ?/?", 5.25), "5 1/4");
    assert_eq!(text("# ??/??", 5.25), "5  1/4 ");
    assert_eq!(text("# ?/8", 5.25), "5 2/8");
    assert_eq!(text("# ??/16", 0.5), "  8/16");
    assert_eq!(text("?/?", 5.25), "21/4");
    assert_eq!(text("# ?/?", -1.5), "-1 1/2");
    assert_eq!(text("# ?/?", 3.0), "3    ");
    assert_eq!(text("# ?/?", 0.0), "0    ");
    assert_eq!(text("# ?/?", 2.99), "3    ");
    assert_eq!(text("0 ?/?", 0.25), "0 1/4");
    assert_eq!(text("# ?/10", 0.3), " 3/10");
}
