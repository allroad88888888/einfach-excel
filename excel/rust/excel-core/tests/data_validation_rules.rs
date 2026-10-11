//! 三种基础规则的原生值语义；不借用 TS 计算或浏览器输入限制。
use einfach_core::{Value, ValueError};
use einfach_excel_core::data_validation::{DataValidationKind as Kind, DataValidationRule as Rule};

fn rule(kind: Kind) -> Rule {
    Rule {
        kind,
        ignore_blank: true,
    }
}

#[test]
fn integer_and_decimal_ranges_include_both_bounds_but_keep_value_types() {
    let integer = rule(Kind::WholeNumber {
        min: -2.0,
        max: 3.0,
    });
    let decimal = rule(Kind::Decimal {
        min: -2.0,
        max: 3.0,
    });
    for number in [-2.0, 0.0, 3.0] {
        assert!(integer.accepts(&Value::Number(number)));
        assert!(decimal.accepts(&Value::Number(number)));
    }
    assert!(!integer.accepts(&Value::Number(1.5)));
    assert!(decimal.accepts(&Value::Number(1.5)));
    for value in [
        Value::Number(-2.01),
        Value::Number(3.01),
        Value::Number(f64::NAN),
        Value::Number(f64::INFINITY),
        Value::Text("2".into()),
        Value::Boolean(true),
        Value::Error(ValueError::DivisionByZero),
    ] {
        assert!(!integer.accepts(&value));
        assert!(!decimal.accepts(&value));
    }
}

#[test]
fn blank_policy_is_explicit_for_each_kind() {
    for kind in [
        Kind::WholeNumber {
            min: 0.0,
            max: 10.0,
        },
        Kind::Decimal { min: 0.0, max: 1.0 },
        Kind::List {
            items: vec!["Paid".into()],
        },
    ] {
        let mut rule = rule(kind);
        for blank in [Value::Null, Value::Text(String::new())] {
            assert!(rule.accepts(&blank));
            rule.ignore_blank = false;
            assert!(!rule.accepts(&blank));
            rule.ignore_blank = true;
        }
        assert!(!rule.accepts(&Value::Text(" ".into())));
    }
}

#[test]
fn lists_match_general_values_case_insensitively_without_trimming_items() {
    let rule = rule(Kind::List {
        items: vec![
            "Paid".into(),
            "0.5".into(),
            "TRUE".into(),
            " x ".into(),
            "Été".into(),
        ],
    });
    for value in [
        Value::Text("PAID".into()),
        Value::Number(0.5),
        Value::Boolean(true),
        Value::Text(" x ".into()),
        Value::Text("été".into()),
    ] {
        assert!(rule.accepts(&value));
    }
    for value in [
        Value::Text("Paid ".into()),
        Value::Text("x".into()),
        Value::Number(5.0),
        Value::Boolean(false),
    ] {
        assert!(!rule.accepts(&value));
    }
}

#[test]
fn malformed_definitions_fail_before_they_can_be_installed() {
    for kind in [
        Kind::WholeNumber { min: 3.0, max: 2.0 },
        Kind::Decimal {
            min: f64::NAN,
            max: 2.0,
        },
        Kind::Decimal {
            min: 0.0,
            max: f64::INFINITY,
        },
        Kind::List { items: vec![] },
        Kind::List {
            items: vec![String::new()],
        },
        Kind::List {
            items: vec!["a\nb".into()],
        },
        Kind::List {
            items: vec!["a\0b".into()],
        },
        Kind::List {
            items: vec!["x".repeat(65537)],
        },
        Kind::List {
            items: vec!["x".into(); 1025],
        },
    ] {
        assert!(rule(kind).validate_definition().is_err());
    }
    assert!(rule(Kind::WholeNumber { min: 0.5, max: 3.5 })
        .validate_definition()
        .is_ok());
    assert!(rule(Kind::Decimal { min: 1.5, max: 1.5 })
        .validate_definition()
        .is_ok());
}
