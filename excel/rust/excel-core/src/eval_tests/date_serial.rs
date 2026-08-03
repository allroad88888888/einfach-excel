//! TODAY/NOW/DATE/DATEVALUE/DAYS/DATEDIF 的日期序列值。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_today_is_valid_date_serial() {
    let (cm, vs) = make_test_env();
    // TODAY returns a Number. Round-tripping through YEAR yields a
    // sensible year (>= 2026 since this test runs after that).
    let r = eval_str("=TODAY()", &cm, &vs);
    match r {
        Value::Number(n) => {
            let (y, m, d) = date_from_serial(n);
            assert!(y >= 2026, "year should be at least 2026, got {}", y);
            assert!((1..=12).contains(&m), "month {} out of range", m);
            assert!((1..=31).contains(&d), "day {} out of range", d);
        }
        other => panic!("TODAY didn't return a Number: {:?}", other),
    }
}

#[test]
fn eval_now_includes_fractional_day() {
    let (cm, vs) = make_test_env();
    // NOW() ≥ TODAY() and < TODAY()+1
    let now_v = eval_str("=NOW()", &cm, &vs);
    let today_v = eval_str("=TODAY()", &cm, &vs);
    if let (Value::Number(now), Value::Number(today)) = (now_v, today_v) {
        assert!(now >= today, "NOW {} should be >= TODAY {}", now, today);
        assert!(now < today + 1.0, "NOW should be on the same day");
    } else {
        panic!("NOW or TODAY didn't return a Number");
    }
}

#[test]
fn eval_date_round_trip() {
    let (cm, vs) = make_test_env();
    // DATE(2026, 5, 8) → some serial; YEAR/MONTH/DAY of that serial
    // round-trips back to the input.
    let serial = eval_str("=DATE(2026,5,8)", &cm, &vs);
    assert!(matches!(serial, Value::Number(_)));
    // The expression is wrapped in YEAR(DATE(...)) so we can compose.
    assert_eq!(
        eval_str("=YEAR(DATE(2026,5,8))", &cm, &vs),
        Value::Number(2026.0)
    );
    assert_eq!(
        eval_str("=MONTH(DATE(2026,5,8))", &cm, &vs),
        Value::Number(5.0)
    );
    assert_eq!(
        eval_str("=DAY(DATE(2026,5,8))", &cm, &vs),
        Value::Number(8.0)
    );
}

#[test]
fn eval_days() {
    let (cm, vs) = make_test_env();
    // 2020 is a leap year → 366 days.
    assert_eq!(
        eval_str("=DAYS(DATE(2021,1,1),DATE(2020,1,1))", &cm, &vs),
        Value::Number(366.0)
    );
    // Same date → 0.
    assert_eq!(
        eval_str("=DAYS(DATE(2020,1,1),DATE(2020,1,1))", &cm, &vs),
        Value::Number(0.0)
    );
    // Wrong arg count.
    assert_eq!(
        eval_str("=DAYS(1)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Wrong type.
    assert_eq!(
        eval_str("=DAYS(\"a\",1)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    // Error propagation.
    assert_eq!(
        eval_str("=DAYS(A1/C1,1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_datedif() {
    let (cm, vs) = make_test_env();
    // start = 2020-01-15, end = 2021-03-20.
    assert_eq!(
        eval_str("=DATEDIF(DATE(2020,1,15),DATE(2021,3,20),\"Y\")", &cm, &vs),
        Value::Number(1.0)
    );
    assert_eq!(
        eval_str("=DATEDIF(DATE(2020,1,15),DATE(2021,3,20),\"M\")", &cm, &vs),
        Value::Number(14.0)
    );
    assert_eq!(
        eval_str("=DATEDIF(DATE(2020,1,15),DATE(2021,3,20),\"YM\")", &cm, &vs),
        Value::Number(2.0)
    );
    assert_eq!(
        eval_str("=DATEDIF(DATE(2020,1,15),DATE(2020,1,20),\"D\")", &cm, &vs),
        Value::Number(5.0)
    );
    // MD: same months, different days.
    assert_eq!(
        eval_str("=DATEDIF(DATE(2020,1,15),DATE(2021,3,20),\"MD\")", &cm, &vs),
        Value::Number(5.0)
    );
    // Unknown unit.
    assert_eq!(
        eval_str("=DATEDIF(DATE(2020,1,15),DATE(2021,3,20),\"ZZ\")", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // start > end → Overflow.
    assert_eq!(
        eval_str("=DATEDIF(DATE(2021,3,20),DATE(2020,1,15),\"D\")", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
    // Wrong arg count.
    assert_eq!(
        eval_str("=DATEDIF(1,2)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Wrong type.
    assert_eq!(
        eval_str("=DATEDIF(\"a\",1,\"D\")", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    // Error propagation.
    assert_eq!(
        eval_str("=DATEDIF(A1/C1,1,\"D\")", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_datevalue() {
    let (cm, vs) = make_test_env();
    // ISO 8601 dash.
    assert_eq!(
        eval_str("=DATEVALUE(\"2020-01-15\")", &cm, &vs),
        Value::Number(date_serial(2020, 1, 15))
    );
    // ISO 8601 slash fallback.
    assert_eq!(
        eval_str("=DATEVALUE(\"2020/01/15\")", &cm, &vs),
        Value::Number(date_serial(2020, 1, 15))
    );
    // Non-ISO text → InvalidValue.
    assert_eq!(
        eval_str("=DATEVALUE(\"Jan 15, 2020\")", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // Invalid month → InvalidValue.
    assert_eq!(
        eval_str("=DATEVALUE(\"2020-13-15\")", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // Wrong arg count.
    assert_eq!(
        eval_str("=DATEVALUE()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Error propagation.
    assert_eq!(
        eval_str("=DATEVALUE(IF(C1,\"a\",\"2020-01-15\")) + A1/C1", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}
