//! HOUR/MINUTE/SECOND/TIME/TIMEVALUE 的时刻分量。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

// === Date / time formula tests ===========================================
// Epoch reminder: 1970-01-01 = serial 0 (Unix-style, not Excel 1900).
// 1970-01-01 was a Thursday → WEEKDAY(0, 1) = 5.

#[test]
fn eval_hour() {
    let (cm, vs) = make_test_env();
    // 0.75 of a day = 18:00 → hour 18.
    assert_eq!(eval_str("=HOUR(0.75)", &cm, &vs), Value::Number(18.0));
    // Whole-day serial → hour 0.
    assert_eq!(eval_str("=HOUR(1)", &cm, &vs), Value::Number(0.0));
    // Through TIME().
    assert_eq!(
        eval_str("=HOUR(TIME(13,30,0))", &cm, &vs),
        Value::Number(13.0)
    );
    // Wrong arg count.
    assert_eq!(
        eval_str("=HOUR()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Wrong type.
    assert_eq!(
        eval_str("=HOUR(\"abc\")", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    // Error propagation.
    assert_eq!(
        eval_str("=HOUR(A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_minute() {
    let (cm, vs) = make_test_env();
    // 0.5 day → 12:00 → minute 0.
    assert_eq!(eval_str("=MINUTE(0.5)", &cm, &vs), Value::Number(0.0));
    // TIME(13, 30, 0) → minute 30.
    assert_eq!(
        eval_str("=MINUTE(TIME(13,30,0))", &cm, &vs),
        Value::Number(30.0)
    );
    // Wrong arg count.
    assert_eq!(
        eval_str("=MINUTE(1,2)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Wrong type.
    assert_eq!(
        eval_str("=MINUTE(\"abc\")", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    // Error propagation.
    assert_eq!(
        eval_str("=MINUTE(A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_second() {
    let (cm, vs) = make_test_env();
    // TIME(13, 30, 45) → second 45 (round trip).
    assert_eq!(
        eval_str("=SECOND(TIME(13,30,45))", &cm, &vs),
        Value::Number(45.0)
    );
    // Whole day → 0.
    assert_eq!(eval_str("=SECOND(1)", &cm, &vs), Value::Number(0.0));
    // Wrong arg count.
    assert_eq!(
        eval_str("=SECOND()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Wrong type.
    assert_eq!(
        eval_str("=SECOND(\"abc\")", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    // Error propagation.
    assert_eq!(
        eval_str("=SECOND(A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_time() {
    let (cm, vs) = make_test_env();
    // 12:00:00 → 0.5.
    assert_eq!(eval_str("=TIME(12,0,0)", &cm, &vs), Value::Number(0.5));
    // 0:0:0 → 0.
    assert_eq!(eval_str("=TIME(0,0,0)", &cm, &vs), Value::Number(0.0));
    // Wrap-around: TIME(25, 0, 0) = 25/24 (no bound on hours).
    let expected = 25.0 * 3600.0 / 86400.0;
    if let Value::Number(n) = eval_str("=TIME(25,0,0)", &cm, &vs) {
        assert!((n - expected).abs() < 1e-12);
    } else {
        panic!("TIME(25,0,0) did not return a Number");
    }
    // Negative → InvalidValue.
    assert_eq!(
        eval_str("=TIME(-1,0,0)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // Wrong arg count.
    assert_eq!(
        eval_str("=TIME(1,2)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Wrong type.
    assert_eq!(
        eval_str("=TIME(\"a\",0,0)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    // Error propagation.
    assert_eq!(
        eval_str("=TIME(A1/C1,0,0)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_timevalue() {
    let (cm, vs) = make_test_env();
    // 12:00 → 0.5.
    assert_eq!(
        eval_str("=TIMEVALUE(\"12:00\")", &cm, &vs),
        Value::Number(0.5)
    );
    // 06:30:30 → (6*3600 + 30*60 + 30) / 86400.
    let expected = (6.0 * 3600.0 + 30.0 * 60.0 + 30.0) / 86400.0;
    if let Value::Number(n) = eval_str("=TIMEVALUE(\"06:30:30\")", &cm, &vs) {
        assert!((n - expected).abs() < 1e-12);
    } else {
        panic!("TIMEVALUE returned non-number");
    }
    // Non-time text → InvalidValue.
    assert_eq!(
        eval_str("=TIMEVALUE(\"hello\")", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // Wrong arg count.
    assert_eq!(
        eval_str("=TIMEVALUE()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Error propagation.
    assert_eq!(
        eval_str("=TIMEVALUE(IF(C1,\"a\",\"12:00\")) + A1/C1", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}
