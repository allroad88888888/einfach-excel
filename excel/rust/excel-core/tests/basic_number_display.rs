//! 数字格式从 JS 收回原生时，保留现有的半数远离零舍入和负零显示语义。
use einfach_excel_core::{CellFormat, NumberFormat};

#[test]
fn decimal_display_rounds_half_away_from_zero_without_negative_zero() {
    for (value, digits, expected) in [
        (2.5, 0, "3"), (-2.5, 0, "-3"), (1.125, 2, "1.13"), (-1.125, 2, "-1.13"),
        (-0.001, 2, "0.00"), (-0.0, 3, "0.000"), (9.999, 2, "10.00"),
        (1234.567, 2, "1,234.57"),
    ] {
        let format = CellFormat { number_format: NumberFormat::Decimal { digits, thousands: true },
            ..Default::default() };
        assert_eq!(format.format_number(value), expected, "{value} / {digits}");
    }
}

#[test]
fn percentage_and_currency_use_the_same_rounding_and_literal_symbols() {
    let percent = CellFormat { number_format: NumberFormat::Percent { digits: 0 }, ..Default::default() };
    assert_eq!(percent.format_number(0.025), "3%");
    assert_eq!(percent.format_number(-0.025), "-3%");
    for (symbol, expected) in [("€", "€-1,234.13"), ("USD ", "USD -1,234.13"), ("", "-1,234.13")] {
        let format = CellFormat { number_format: NumberFormat::Currency { symbol: symbol.into(), digits: 2 },
            ..Default::default() };
        assert_eq!(format.format_number(-1234.125), expected);
    }
}

#[test]
fn formatting_large_finite_values_does_not_overflow_the_rounding_scale() {
    let format = CellFormat { number_format: NumberFormat::Decimal { digits: 2, thousands: false },
        ..Default::default() };
    let output = format.format_number(1e308);
    assert!(output.ends_with(".00"));
    assert!(!output.contains("inf") && !output.contains("NaN"));
}
