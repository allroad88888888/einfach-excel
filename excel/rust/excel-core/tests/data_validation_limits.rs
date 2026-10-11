//! 日期、钟点、文本长度均检查原生值；拒绝不改变原值/格式/历史。
use einfach_core::{Value, ValueError};
use einfach_excel_core::data_validation::{DataValidationKind as Kind, DataValidationRule as Rule};
use einfach_excel_core::{CellAddress, CellRange, Workbook};

fn rule(kind: Kind) -> Rule {
    Rule {
        kind,
        ignore_blank: false,
        operator: Default::default(),
    }
}
fn date(min: &str, max: &str) -> Kind {
    Kind::Date {
        min: min.into(),
        max: max.into(),
    }
}
fn time(min: &str, max: &str) -> Kind {
    Kind::Time {
        min: min.into(),
        max: max.into(),
    }
}

#[test]
fn dates_use_excel_serials_including_the_1900_leap_day() {
    let rule = rule(date("1900-02-28", "1900-03-01"));
    rule.validate_definition().unwrap();
    for number in [59.0, 60.0, 60.5, 61.0] {
        assert!(rule.accepts(&Value::Number(number)));
    }
    for value in [
        Value::Number(58.0),
        Value::Number(61.5),
        Value::Number(f64::NAN),
        Value::Text("1900-02-29".into()),
        Value::Boolean(true),
        Value::Null,
    ] {
        assert!(!rule.accepts(&value));
    }
    assert!(rule_for_single_date().accepts(&Value::Number(60.0)));
}

fn rule_for_single_date() -> Rule {
    rule(date("1900-02-29", "1900-02-29"))
}

#[test]
fn clock_limits_include_seconds_and_am_pm_without_wrapping_elapsed_time() {
    let rule = rule(time("9:00 AM", "17:00:01"));
    rule.validate_definition().unwrap();
    for seconds in [9.0 * 3600.0, 12.0 * 3600.0, 17.0 * 3600.0 + 1.0] {
        assert!(rule.accepts(&Value::Number(seconds / 86400.0)));
    }
    for value in [
        Value::Number(0.0),
        Value::Number(1.0),
        Value::Number(-0.5),
        Value::Number(17.0 / 24.0 + 2.0 / 86400.0),
        Value::Text("12:00".into()),
    ] {
        assert!(!rule.accepts(&value));
    }
}

#[test]
fn text_length_matches_len_not_utf8_bytes_or_formatted_display() {
    let exactly_three = rule(Kind::TextLength { min: 3.0, max: 3.0 });
    for value in [
        Value::Text("中文🙂".into()),
        Value::Text(" a ".into()),
        Value::Number(123.0),
        Value::Number(0.5),
    ] {
        assert!(exactly_three.accepts(&value));
    }
    for value in [
        Value::Text("中文".into()),
        Value::Text("abcd".into()),
        Value::Boolean(true),
        Value::Error(ValueError::DivisionByZero),
        Value::Number(f64::INFINITY),
    ] {
        assert!(!exactly_three.accepts(&value));
    }
    assert!(rule(Kind::TextLength { min: 4.0, max: 4.0 }).accepts(&Value::Boolean(true)));
    assert!(rule(Kind::TextLength { min: 2.0, max: 2.0 }).accepts(&Value::Text("e\u{301}".into())));
}

#[test]
fn blank_policy_applies_length_zero_when_not_ignored() {
    for blank in [Value::Null, Value::Text(String::new())] {
        assert!(rule(Kind::TextLength { min: 0.0, max: 0.0 }).accepts(&blank));
        let mut limit = rule(Kind::TextLength { min: 1.0, max: 3.0 });
        assert!(!limit.accepts(&blank));
        limit.ignore_blank = true;
        assert!(limit.accepts(&blank));
    }
}

#[test]
fn invalid_bounds_are_rejected_before_installation() {
    for kind in [
        date("2026-02-29", "2026-03-01"),
        date("2026-10-12", "2026-10-11"),
        date("=TODAY()", "2026-12-31"),
        date("01/02/2026", "2026-12-31"),
        time("00:00", "24:00"),
        time("17:00", "09:00"),
        time("12:60", "13:00"),
        Kind::TextLength {
            min: -1.0,
            max: 10.0,
        },
        Kind::TextLength { min: 0.5, max: 2.0 },
        Kind::TextLength { min: 3.0, max: 2.0 },
        Kind::TextLength {
            min: 0.0,
            max: f64::NAN,
        },
    ] {
        assert!(rule(kind).validate_definition().is_err());
    }
}

#[test]
fn ordinary_input_and_formula_results_use_the_same_limits_without_losing_values() {
    let mut book = Workbook::new();
    for (col, kind, good, bad) in [
        (
            0,
            date("2026-10-01", "2026-10-31"),
            "2026-10-11",
            "2026-11-01",
        ),
        (1, time("09:00", "17:00"), "12:00", "18:00"),
        (2, Kind::TextLength { min: 2.0, max: 4.0 }, "中文🙂", "x"),
    ] {
        let address = CellAddress::new(0, col);
        let label = address.to_string_repr();
        book.sheet_mut(0)
            .unwrap()
            .set_data_validation(CellRange::single(address), Some(rule(kind)))
            .unwrap();
        book.set_cell_input(0, &label, good).unwrap();
        let before = book.get_cell("Sheet1", &label);
        let format = book.sheet(0).unwrap().get_format(&label);
        assert_eq!(
            book.set_cell_input(0, &label, bad),
            Err("DATA_VALIDATION_FAILED")
        );
        assert_eq!(book.get_cell("Sheet1", &label), before);
        assert_eq!(book.sheet(0).unwrap().get_format(&label), format);
    }
    book.set_cell_input(0, "A1", "=DATE(2026,10,31)").unwrap();
    book.set_cell_input(0, "B1", "=TIME(17,0,0)").unwrap();
    book.set_cell_input(0, "C1", "=\"four\"").unwrap();
    for (address, input) in [
        ("A1", "=DATE(2026,11,1)"),
        ("B1", "=TIME(18,0,0)"),
        ("C1", "=\"longer\""),
        ("A1", "'2026-10-11"),
        ("B1", "'12:00"),
    ] {
        let before = book.get_cell("Sheet1", address);
        let formula = book.sheet(0).unwrap().get_formula(address);
        assert_eq!(
            book.set_cell_input(0, address, input),
            Err("DATA_VALIDATION_FAILED")
        );
        assert_eq!(book.get_cell("Sheet1", address), before);
        assert_eq!(book.sheet(0).unwrap().get_formula(address), formula);
    }
}
