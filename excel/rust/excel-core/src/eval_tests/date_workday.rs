//! WORKDAY 及其 INTL 变体的工作日推算。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_workday() {
    let (cm, vs) = make_test_env();
    // Mon 2024-01-01 + 4 workdays → Fri 2024-01-05.
    assert_eq!(
        eval_str("=WORKDAY(DATE(2024,1,1),4)", &cm, &vs),
        Value::Number(date_serial(2024, 1, 5))
    );
    // Mon 2024-01-01 + 5 workdays → Mon 2024-01-08 (skipping weekend).
    assert_eq!(
        eval_str("=WORKDAY(DATE(2024,1,1),5)", &cm, &vs),
        Value::Number(date_serial(2024, 1, 8))
    );
    // Zero days → returns the start serial (Excel does NOT snap to
    // next workday for the 0 case).
    assert_eq!(
        eval_str("=WORKDAY(DATE(2024,1,1),0)", &cm, &vs),
        Value::Number(date_serial(2024, 1, 1))
    );
    // Even from a weekend day, 0 days returns the start as-is.
    assert_eq!(
        eval_str("=WORKDAY(DATE(2024,1,6),0)", &cm, &vs),
        Value::Number(date_serial(2024, 1, 6))
    );
    // Negative days: Mon 2024-01-08 - 5 workdays → Mon 2024-01-01.
    assert_eq!(
        eval_str("=WORKDAY(DATE(2024,1,8),-5)", &cm, &vs),
        Value::Number(date_serial(2024, 1, 1))
    );
    // Holiday lands on the natural step target: must advance further.
    // Mon 2024-01-01 + 2 workdays would normally → Wed 2024-01-03.
    // Mark Wed 2024-01-03 as holiday → result must be Thu 2024-01-04.
    assert_eq!(
        eval_str("=WORKDAY(DATE(2024,1,1),2,DATE(2024,1,3))", &cm, &vs),
        Value::Number(date_serial(2024, 1, 4))
    );
    // Arg-count error.
    assert_eq!(
        eval_str("=WORKDAY(DATE(2024,1,1))", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Type error on `days`.
    assert_eq!(
        eval_str("=WORKDAY(DATE(2024,1,1),\"x\")", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
}

#[test]
fn eval_workday_intl() {
    let (cm, vs) = make_test_env();
    // Default weekend (Sat+Sun): Mon 2024-01-01 + 5 → Mon 2024-01-08.
    assert_eq!(
        eval_str("=WORKDAY.INTL(DATE(2024,1,1),5,1)", &cm, &vs),
        Value::Number(date_serial(2024, 1, 8))
    );
    // Weekend code 7 (Fri+Sat). Mon 2024-01-01 + 4 → step through
    // Tue Wed Thu Sun (Sun is a workday under code 7), landing on
    // Sun 2024-01-07.
    assert_eq!(
        eval_str("=WORKDAY.INTL(DATE(2024,1,1),4,7)", &cm, &vs),
        Value::Number(date_serial(2024, 1, 7))
    );
    // Mask "0000011" matches default.
    assert_eq!(
        eval_str("=WORKDAY.INTL(DATE(2024,1,1),5,\"0000011\")", &cm, &vs),
        Value::Number(date_serial(2024, 1, 8))
    );
    // Holiday under code 7: Mon + 4 normally → Sun 2024-01-07.
    // Mark that day as holiday; next workday under code 7 is
    // Mon 2024-01-08.
    assert_eq!(
        eval_str("=WORKDAY.INTL(DATE(2024,1,1),4,7,DATE(2024,1,7))", &cm, &vs),
        Value::Number(date_serial(2024, 1, 8))
    );
    // Invalid weekend mask → InvalidValue.
    assert_eq!(
        eval_str("=WORKDAY.INTL(DATE(2024,1,1),5,\"1111111\")", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // Arg-count error.
    assert_eq!(
        eval_str("=WORKDAY.INTL(DATE(2024,1,1))", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}
