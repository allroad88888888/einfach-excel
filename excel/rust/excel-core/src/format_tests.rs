use super::*;

#[test]
fn default_general() {
    let f = CellFormat::default();
    assert_eq!(f.format_number(42.0), "42");
    assert_eq!(f.format_number(3.14), "3.14");
}

#[test]
fn fixed_decimal_no_thousands() {
    let f = CellFormat {
        number_format: NumberFormat::Decimal {
            digits: 2,
            thousands: false,
        },
        ..Default::default()
    };
    assert_eq!(f.format_number(1234.5), "1234.50");
}

#[test]
fn fixed_decimal_with_thousands() {
    let f = CellFormat {
        number_format: NumberFormat::Decimal {
            digits: 2,
            thousands: true,
        },
        ..Default::default()
    };
    assert_eq!(f.format_number(1234567.5), "1,234,567.50");
    assert_eq!(f.format_number(-1234.5), "-1,234.50");
}

#[test]
fn fixed_decimal_zero_digits_rounds_before_grouping() {
    let f = CellFormat {
        number_format: NumberFormat::Decimal {
            digits: 0,
            thousands: true,
        },
        ..Default::default()
    };
    assert_eq!(f.format_number(1234.6), "1,235");
    assert_eq!(f.format_number(-1234.4), "-1,234");
}

#[test]
fn percent() {
    let f = CellFormat {
        number_format: NumberFormat::Percent { digits: 1 },
        ..Default::default()
    };
    assert_eq!(f.format_number(0.125), "12.5%");
}

#[test]
fn percent_zero_digits_scales_and_preserves_sign() {
    let f = CellFormat {
        number_format: NumberFormat::Percent { digits: 0 },
        ..Default::default()
    };
    assert_eq!(f.format_number(0.1234), "12%");
    assert_eq!(f.format_number(-0.5), "-50%");
}

#[test]
fn rule_greater_than() {
    let r = ConditionalRule {
        condition: Condition::GreaterThan(100.0),
        overrides: StyleOverrides {
            color: Some("red".into()),
            ..Default::default()
        },
    };
    assert!(r.matches(&Value::Number(150.0)));
    assert!(!r.matches(&Value::Number(50.0)));
    assert!(!r.matches(&Value::Text("hi".into())));
}

#[test]
fn rule_is_error() {
    use einfach_core::ValueError;
    let r = ConditionalRule {
        condition: Condition::IsError,
        overrides: Default::default(),
    };
    assert!(r.matches(&Value::Error(ValueError::DivisionByZero)));
    assert!(!r.matches(&Value::Number(0.0)));
}

#[test]
fn rule_contains_text_case_insensitive() {
    let r = ConditionalRule {
        condition: Condition::ContainsText("ERR".into()),
        overrides: Default::default(),
    };
    assert!(r.matches(&Value::Text("error message".into())));
    assert!(!r.matches(&Value::Text("ok".into())));
}

#[test]
fn apply_rules_first_match_wins() {
    let base = CellFormat::default();
    let rules = vec![
        ConditionalRule {
            condition: Condition::GreaterThan(100.0),
            overrides: StyleOverrides {
                color: Some("red".into()),
                ..Default::default()
            },
        },
        ConditionalRule {
            condition: Condition::GreaterThan(50.0),
            overrides: StyleOverrides {
                color: Some("orange".into()),
                ..Default::default()
            },
        },
    ];
    let f = apply_rules(&base, &rules, &Value::Number(150.0));
    assert_eq!(f.color, Some("red".into()));
    let f = apply_rules(&base, &rules, &Value::Number(75.0));
    assert_eq!(f.color, Some("orange".into()));
    let f = apply_rules(&base, &rules, &Value::Number(10.0));
    assert_eq!(f.color, None);
}

#[test]
fn currency() {
    let f = CellFormat {
        number_format: NumberFormat::Currency {
            symbol: "¥".into(),
            digits: 2,
        },
        ..Default::default()
    };
    assert_eq!(f.format_number(1234.56), "¥1,234.56");
}

#[test]
fn currency_uses_symbol_grouping_and_configured_digits() {
    let f = CellFormat {
        number_format: NumberFormat::Currency {
            symbol: "$".into(),
            digits: 0,
        },
        ..Default::default()
    };
    assert_eq!(f.format_number(1234.6), "$1,235");
}

/// The two variants whose rendered token differs from their `Display`.
/// Excel has neither `#TYPE!` nor `#ARGS!`; both survive internally for
/// diagnostics but must never reach a cell.
#[test]
fn non_excel_variants_render_as_value_error() {
    for err in [ValueError::WrongType, ValueError::WrongArgCount] {
        assert_eq!(error_display_token(&err), "#VALUE!", "{err:?}");
        assert_eq!(value_to_display(&Value::Error(err.clone())), "#VALUE!");
    }
    // The diagnostic spellings are unchanged — that is what makes the
    // formula-text round-trip through `parse_error_literal` still work.
    assert_eq!(format!("{}", ValueError::WrongType), "#TYPE!");
    assert_eq!(format!("{}", ValueError::WrongArgCount), "#ARGS!");
}

/// `#CYCLE!` is a non-Excel code too, and it is DELIBERATELY not
/// collapsed — Excel shows `0` plus a status-bar warning for a circular
/// reference, which hides a real bug inside a plausible number. See the
/// registry on `error_display_token`. This pins the decision so an
/// "align everything with Excel" pass has to argue with a red test.
#[test]
fn cyclic_ref_keeps_its_non_excel_token() {
    assert_eq!(error_display_token(&ValueError::CyclicRef), "#CYCLE!");
    assert_eq!(
        value_to_display(&Value::Error(ValueError::CyclicRef)),
        "#CYCLE!"
    );
}

/// Every other variant renders exactly as it serializes. Guards against
/// someone "helpfully" extending the collapse to codes Excel does have.
#[test]
fn other_error_variants_render_as_their_display() {
    for err in [
        ValueError::Null,
        ValueError::DivisionByZero,
        ValueError::NotAvailable,
        ValueError::InvalidRef,
        ValueError::InvalidValue,
        ValueError::InvalidName,
        ValueError::CyclicRef,
        ValueError::Overflow,
        ValueError::Spill,
        ValueError::Calc,
        ValueError::Busy,
    ] {
        assert_eq!(error_display_token(&err), err.to_string(), "{err:?}");
    }
}
