//! NETWORKDAYS 及其 INTL 变体的工作日计数。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_networkdays() {
    let (cm, vs) = make_test_env();
    // Mon 2024-01-01 (start) to Sun 2024-01-07 (end): 5 workdays
    // Mon..Fri.
    assert_eq!(
        eval_str("=NETWORKDAYS(DATE(2024,1,1),DATE(2024,1,7))", &cm, &vs),
        Value::Number(5.0)
    );
    // Mon 2024-01-01 to Fri 2024-01-05 inclusive: 5 workdays.
    assert_eq!(
        eval_str("=NETWORKDAYS(DATE(2024,1,1),DATE(2024,1,5))", &cm, &vs),
        Value::Number(5.0)
    );
    // Whole calendar week with one holiday inside (Wed 2024-01-03):
    // 4 workdays.
    assert_eq!(
        eval_str(
            "=NETWORKDAYS(DATE(2024,1,1),DATE(2024,1,7),DATE(2024,1,3))",
            &cm,
            &vs
        ),
        Value::Number(4.0)
    );
    // start > end → negative result.
    assert_eq!(
        eval_str("=NETWORKDAYS(DATE(2024,1,7),DATE(2024,1,1))", &cm, &vs),
        Value::Number(-5.0)
    );
    // Same day, working day → 1.
    assert_eq!(
        eval_str("=NETWORKDAYS(DATE(2024,1,1),DATE(2024,1,1))", &cm, &vs),
        Value::Number(1.0)
    );
    // Same day, weekend → 0.
    assert_eq!(
        eval_str("=NETWORKDAYS(DATE(2024,1,6),DATE(2024,1,6))", &cm, &vs),
        Value::Number(0.0)
    );
    // Arg-count error: zero args.
    assert_eq!(
        eval_str("=NETWORKDAYS()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Arg-count error: too many args.
    assert_eq!(
        eval_str(
            "=NETWORKDAYS(DATE(2024,1,1),DATE(2024,1,7),DATE(2024,1,3),1)",
            &cm,
            &vs
        ),
        Value::Error(ValueError::WrongArgCount)
    );
    // Type error.
    assert_eq!(
        eval_str("=NETWORKDAYS(\"a\",DATE(2024,1,7))", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    // Error propagation through start arg.
    assert_eq!(
        eval_str("=NETWORKDAYS(A1/C1,DATE(2024,1,7))", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_networkdays_intl() {
    let (cm, vs) = make_test_env();
    // Default (code 1 = Sat+Sun): Mon 2024-01-01 to Sun 2024-01-07 → 5.
    assert_eq!(
        eval_str(
            "=NETWORKDAYS.INTL(DATE(2024,1,1),DATE(2024,1,7),1)",
            &cm,
            &vs
        ),
        Value::Number(5.0)
    );
    // Code 7 = Fri+Sat weekend. Mon..Sun has 5 working days
    // (Sun, Mon, Tue, Wed, Thu).
    assert_eq!(
        eval_str(
            "=NETWORKDAYS.INTL(DATE(2024,1,1),DATE(2024,1,7),7)",
            &cm,
            &vs
        ),
        Value::Number(5.0)
    );
    // Code 7 over a Mon..Thu range: 4 workdays.
    assert_eq!(
        eval_str(
            "=NETWORKDAYS.INTL(DATE(2024,1,1),DATE(2024,1,4),7)",
            &cm,
            &vs
        ),
        Value::Number(4.0)
    );
    // Code 7 over Fri..Sat: 0 workdays (both are weekend under code 7).
    assert_eq!(
        eval_str(
            "=NETWORKDAYS.INTL(DATE(2024,1,5),DATE(2024,1,6),7)",
            &cm,
            &vs
        ),
        Value::Number(0.0)
    );
    // Default code 1: same Fri..Sat range yields 1 workday (Fri).
    assert_eq!(
        eval_str("=NETWORKDAYS.INTL(DATE(2024,1,5),DATE(2024,1,6))", &cm, &vs),
        Value::Number(1.0)
    );
    // Mask "0000011" = Sat+Sun weekend, equivalent to default.
    assert_eq!(
        eval_str(
            "=NETWORKDAYS.INTL(DATE(2024,1,1),DATE(2024,1,7),\"0000011\")",
            &cm,
            &vs
        ),
        Value::Number(5.0)
    );
    // Single-day weekend code 11 = Sun only: Mon..Sun = 6 workdays.
    assert_eq!(
        eval_str(
            "=NETWORKDAYS.INTL(DATE(2024,1,1),DATE(2024,1,7),11)",
            &cm,
            &vs
        ),
        Value::Number(6.0)
    );
    // All-1s mask → InvalidValue.
    assert_eq!(
        eval_str(
            "=NETWORKDAYS.INTL(DATE(2024,1,1),DATE(2024,1,7),\"1111111\")",
            &cm,
            &vs
        ),
        Value::Error(ValueError::InvalidValue)
    );
    // Bad mask length → InvalidValue.
    assert_eq!(
        eval_str(
            "=NETWORKDAYS.INTL(DATE(2024,1,1),DATE(2024,1,7),\"011\")",
            &cm,
            &vs
        ),
        Value::Error(ValueError::InvalidValue)
    );
    // Bad mask character → InvalidValue.
    assert_eq!(
        eval_str(
            "=NETWORKDAYS.INTL(DATE(2024,1,1),DATE(2024,1,7),\"000002X\")",
            &cm,
            &vs
        ),
        Value::Error(ValueError::InvalidValue)
    );
    // Invalid numeric weekend code → InvalidValue.
    assert_eq!(
        eval_str(
            "=NETWORKDAYS.INTL(DATE(2024,1,1),DATE(2024,1,7),99)",
            &cm,
            &vs
        ),
        Value::Error(ValueError::InvalidValue)
    );
    // Code 7 with a holiday on Sun 2024-01-07 (a workday under code 7):
    // 5 workdays minus 1 = 4.
    assert_eq!(
        eval_str(
            "=NETWORKDAYS.INTL(DATE(2024,1,1),DATE(2024,1,7),7,DATE(2024,1,7))",
            &cm,
            &vs
        ),
        Value::Number(4.0)
    );
    // Arg-count error.
    assert_eq!(
        eval_str("=NETWORKDAYS.INTL(DATE(2024,1,1))", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}
