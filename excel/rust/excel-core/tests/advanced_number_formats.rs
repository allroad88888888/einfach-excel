use einfach_excel_core::{CellFormat, FractionDenominator as Denom, NumberFormat};

fn render(format: NumberFormat, value: f64) -> String {
    CellFormat {
        number_format: format,
        ..Default::default()
    }
    .format_number(value)
}

#[test]
fn scientific_rounding_exponents_and_extremes() {
    for (value, digits, expected) in [
        (12_200_000.0, 2, "1.22E+07"),
        (0.0000123, 2, "1.23E-05"),
        (-1234.0, 1, "-1.2E+03"),
        (9.999, 2, "1.00E+01"),
        (0.0, 2, "0.00E+00"),
        (-0.0, 0, "0E+00"),
        (1e-300, 2, "1.00E-300"),
        (1e308, 2, "1.00E+308"),
        (1.25, 15, "1.250000000000000E+00"),
        (1.25, 1, "1.3E+00"),
        (-1.25, 1, "-1.3E+00"),
        (12345.0, 3, "1.235E+04"),
        (f64::from_bits(1), 2, "4.94E-324"),
    ] {
        assert_eq!(render(NumberFormat::Scientific { digits }, value), expected);
    }
    assert_eq!(
        render(NumberFormat::Scientific { digits: 255 }, 1.0),
        "1.000000000000000E+00"
    );
}

#[test]
fn fraction_precision_sign_carry_and_fixed_denominators() {
    for (value, denominator, expected) in [
        (5.25, Denom::OneDigit, "5 1/4"),
        (5.3, Denom::ThreeDigit, "5 3/10"),
        (0.125, Denom::OneDigit, "1/8"),
        (-0.125, Denom::OneDigit, "-1/8"),
        (-2.5, Denom::TwoDigit, "-2 1/2"),
        (0.05, Denom::OneDigit, "0"),
        (0.05, Denom::TwoDigit, "1/20"),
        (0.001, Denom::ThreeDigit, "1/999"),
        (0.9999, Denom::ThreeDigit, "1"),
        (4.9999, Denom::OneDigit, "5"),
        (0.5, Denom::Fixed(8), "4/8"),
        (0.3125, Denom::Fixed(16), "5/16"),
        (0.375, Denom::Fixed(4), "2/4"),
        (1.99, Denom::Fixed(4), "2"),
        (0.0, Denom::Fixed(100), "0"),
        (5.0, Denom::TwoDigit, "5"),
        (-0.00001, Denom::OneDigit, "0"),
        (0.5, Denom::Fixed(u32::MAX), "2147483648/4294967295"),
    ] {
        assert_eq!(
            render(NumberFormat::Fraction { denominator }, value),
            expected
        );
    }
}

#[test]
fn time_patterns_use_day_fractions_and_elapsed_hours() {
    let value = 1.0 + (13.0 * 3600.0 + 5.0 * 60.0 + 7.0) / 86400.0;
    for (pattern, expected) in [
        ("h:mm", "13:05"),
        ("hh:mm", "13:05"),
        ("h:mm:ss", "13:05:07"),
        ("hh:mm:ss", "13:05:07"),
        ("h:mm AM/PM", "1:05 PM"),
        ("h:mm:ss AM/PM", "1:05:07 PM"),
        ("mm:ss", "05:07"),
        ("[h]:mm:ss", "37:05:07"),
    ] {
        assert_eq!(render(NumberFormat::Time(pattern.into()), value), expected);
    }
    for (value, pattern, expected) in [
        (0.0, "h:mm AM/PM", "12:00 AM"),
        (0.5, "h:mm AM/PM", "12:00 PM"),
        (0.25, "hh:mm:ss", "06:00:00"),
        (0.25, "h:mm:ss", "6:00:00"),
        (86399.6 / 86400.0, "hh:mm:ss", "00:00:00"),
        (86399.6 / 86400.0, "[h]:mm:ss", "24:00:00"),
        (60.5, "hh:mm:ss", "12:00:00"),
        (2958465.5, "hh:mm:ss", "12:00:00"),
        (-0.25, "hh:mm:ss", "#####"),
        (2958466.0, "hh:mm:ss", "#####"),
        (0.5, "not a time format", "#####"),
    ] {
        assert_eq!(render(NumberFormat::Time(pattern.into()), value), expected);
    }
}

#[test]
fn invalid_numeric_values_never_overflow_the_formatters() {
    for number in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
        for format in [
            NumberFormat::Scientific { digits: 2 },
            NumberFormat::Fraction {
                denominator: Denom::OneDigit,
            },
            NumberFormat::Time("hh:mm:ss".into()),
        ] {
            assert_eq!(render(format, number), "#####");
        }
    }
    assert_eq!(
        render(
            NumberFormat::Fraction {
                denominator: Denom::Fixed(0)
            },
            0.5
        ),
        "#####"
    );
}
