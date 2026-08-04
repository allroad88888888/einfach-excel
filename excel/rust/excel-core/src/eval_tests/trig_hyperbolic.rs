//! 六个双曲函数 SINH/COSH/TANH 及其反函数。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

// ---- Hyperbolic + reciprocal trig ----

#[test]
fn eval_sinh() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=SINH(0)", &cm, &vs), Value::Number(0.0));
    match eval_str("=SINH(1)", &cm, &vs) {
        Value::Number(n) => assert!((n - 1.0f64.sinh()).abs() < 1e-9, "SINH(1) = {n}"),
        other => panic!("expected number, got {:?}", other),
    }
    assert_eq!(
        eval_str("=SINH()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=SINH(B2)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    assert_eq!(
        eval_str("=SINH(A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
    // Massive arg → finite double-precision overflow.
    assert_eq!(
        eval_str("=SINH(1000)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_cosh() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=COSH(0)", &cm, &vs), Value::Number(1.0));
    match eval_str("=COSH(1)", &cm, &vs) {
        Value::Number(n) => assert!((n - 1.0f64.cosh()).abs() < 1e-9, "COSH(1) = {n}"),
        other => panic!("expected number, got {:?}", other),
    }
    assert_eq!(
        eval_str("=COSH()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=COSH(B2)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    assert_eq!(
        eval_str("=COSH(A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
    assert_eq!(
        eval_str("=COSH(1000)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_tanh() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=TANH(0)", &cm, &vs), Value::Number(0.0));
    match eval_str("=TANH(1)", &cm, &vs) {
        Value::Number(n) => assert!((n - 1.0f64.tanh()).abs() < 1e-9, "TANH(1) = {n}"),
        other => panic!("expected number, got {:?}", other),
    }
    // Saturates to +/-1 at large |n| — still finite.
    match eval_str("=TANH(1000)", &cm, &vs) {
        Value::Number(n) => assert!((n - 1.0).abs() < 1e-9, "TANH(1000) = {n}"),
        other => panic!("expected number, got {:?}", other),
    }
    assert_eq!(
        eval_str("=TANH()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=TANH(B2)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    assert_eq!(
        eval_str("=TANH(A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_asinh() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=ASINH(0)", &cm, &vs), Value::Number(0.0));
    match eval_str("=ASINH(1)", &cm, &vs) {
        Value::Number(n) => assert!((n - 1.0f64.asinh()).abs() < 1e-9, "ASINH(1) = {n}"),
        other => panic!("expected number, got {:?}", other),
    }
    assert_eq!(
        eval_str("=ASINH()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=ASINH(B2)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    assert_eq!(
        eval_str("=ASINH(A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_acosh() {
    let (cm, vs) = make_test_env();
    // acosh(1) = 0.
    assert_eq!(eval_str("=ACOSH(1)", &cm, &vs), Value::Number(0.0));
    match eval_str("=ACOSH(2)", &cm, &vs) {
        Value::Number(n) => assert!((n - 2.0f64.acosh()).abs() < 1e-9, "ACOSH(2) = {n}"),
        other => panic!("expected number, got {:?}", other),
    }
    // Below domain — Excel #NUM!.
    assert_eq!(
        eval_str("=ACOSH(0)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
    assert_eq!(
        eval_str("=ACOSH(-2)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
    assert_eq!(
        eval_str("=ACOSH()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=ACOSH(B2)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    assert_eq!(
        eval_str("=ACOSH(A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_atanh() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=ATANH(0)", &cm, &vs), Value::Number(0.0));
    match eval_str("=ATANH(0.5)", &cm, &vs) {
        Value::Number(n) => assert!((n - 0.5f64.atanh()).abs() < 1e-9, "ATANH(0.5) = {n}"),
        other => panic!("expected number, got {:?}", other),
    }
    // |n| >= 1 → out of domain.
    assert_eq!(
        eval_str("=ATANH(1)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
    assert_eq!(
        eval_str("=ATANH(-1)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
    assert_eq!(
        eval_str("=ATANH(2)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
    assert_eq!(
        eval_str("=ATANH()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=ATANH(B2)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    assert_eq!(
        eval_str("=ATANH(A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}
