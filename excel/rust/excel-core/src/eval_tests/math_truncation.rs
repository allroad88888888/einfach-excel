//! INT/TRUNC/SIGN/QUOTIENT 的截断取整。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

// === B2 + B3: math + trig formulas ===
//
// Each test follows the same shape: happy path; WrongArgCount;
// WrongType; numeric/domain edge; error propagation. Variadic
// function tests additionally exercise a range argument.

// ---- B2: math ----

#[test]
fn eval_int() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=INT(4.7)", &cm, &vs), Value::Number(4.0));
    // floor toward -∞: INT(-2.5) = -3, NOT -2.
    assert_eq!(eval_str("=INT(-2.5)", &cm, &vs), Value::Number(-3.0));
    assert_eq!(eval_str("=INT(A1)", &cm, &vs), Value::Number(10.0));
    assert_eq!(
        eval_str("=INT()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=INT(B2)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    // Error propagation through a sub-expression.
    assert_eq!(
        eval_str("=INT(A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_trunc() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=TRUNC(8.9)", &cm, &vs), Value::Number(8.0));
    // Negative: trunc toward zero, not floor: -2.5 → -2.
    assert_eq!(eval_str("=TRUNC(-2.5)", &cm, &vs), Value::Number(-2.0));
    assert_eq!(eval_str("=TRUNC(3.14159,2)", &cm, &vs), Value::Number(3.14));
    // Negative digits truncate to the left of the decimal point.
    assert_eq!(
        eval_str("=TRUNC(123.45,-1)", &cm, &vs),
        Value::Number(120.0)
    );
    assert_eq!(
        eval_str("=TRUNC()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=TRUNC(B2)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    assert_eq!(
        eval_str("=TRUNC(A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_sign() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=SIGN(7)", &cm, &vs), Value::Number(1.0));
    assert_eq!(eval_str("=SIGN(-3)", &cm, &vs), Value::Number(-1.0));
    assert_eq!(eval_str("=SIGN(0)", &cm, &vs), Value::Number(0.0));
    assert_eq!(eval_str("=SIGN(A1)", &cm, &vs), Value::Number(1.0));
    assert_eq!(
        eval_str("=SIGN()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=SIGN(B2)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    assert_eq!(
        eval_str("=SIGN(A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_quotient() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=QUOTIENT(7,2)", &cm, &vs), Value::Number(3.0));
    assert_eq!(eval_str("=QUOTIENT(-7,2)", &cm, &vs), Value::Number(-3.0));
    assert_eq!(eval_str("=QUOTIENT(A1,A2)", &cm, &vs), Value::Number(2.0));
    assert_eq!(
        eval_str("=QUOTIENT(5,0)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
    assert_eq!(
        eval_str("=QUOTIENT(5)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=QUOTIENT(B2,2)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    assert_eq!(
        eval_str("=QUOTIENT(A1,A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}
