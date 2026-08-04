//! EXP/LN/LOG/LOG10/PI 的指数对数。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_exp() {
    let (cm, vs) = make_test_env();
    // EXP(0) = 1, EXP(1) ≈ e.
    assert_eq!(eval_str("=EXP(0)", &cm, &vs), Value::Number(1.0));
    match eval_str("=EXP(1)", &cm, &vs) {
        Value::Number(n) => {
            assert!((n - std::f64::consts::E).abs() < 1e-12, "EXP(1)={}", n)
        }
        other => panic!("expected number, got {:?}", other),
    }
    // Huge → +inf → Overflow.
    assert_eq!(
        eval_str("=EXP(1000)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
    assert_eq!(
        eval_str("=EXP()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=EXP(B2)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    assert_eq!(
        eval_str("=EXP(A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_ln() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=LN(1)", &cm, &vs), Value::Number(0.0));
    match eval_str("=LN(2.718281828459045)", &cm, &vs) {
        Value::Number(n) => assert!((n - 1.0).abs() < 1e-12, "LN(e)={}", n),
        other => panic!("expected number, got {:?}", other),
    }
    // LN(0) and LN(-1) are domain errors → Overflow.
    assert_eq!(
        eval_str("=LN(0)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
    assert_eq!(
        eval_str("=LN(-1)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
    assert_eq!(
        eval_str("=LN()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=LN(\"abc\")", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    assert_eq!(
        eval_str("=LN(A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_log() {
    let (cm, vs) = make_test_env();
    // Default base = 10.
    assert_eq!(eval_str("=LOG(100)", &cm, &vs), Value::Number(2.0));
    assert_eq!(eval_str("=LOG(8,2)", &cm, &vs), Value::Number(3.0));
    // Domain violations → Overflow.
    assert_eq!(
        eval_str("=LOG(0)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
    assert_eq!(
        eval_str("=LOG(-5)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
    assert_eq!(
        eval_str("=LOG(10,1)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
    assert_eq!(
        eval_str("=LOG(10,-2)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
    assert_eq!(
        eval_str("=LOG()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=LOG(B2)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    assert_eq!(
        eval_str("=LOG(A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_log10() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=LOG10(1000)", &cm, &vs), Value::Number(3.0));
    assert_eq!(eval_str("=LOG10(1)", &cm, &vs), Value::Number(0.0));
    assert_eq!(
        eval_str("=LOG10(0)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
    assert_eq!(
        eval_str("=LOG10(-2)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
    assert_eq!(
        eval_str("=LOG10()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=LOG10(B2)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    assert_eq!(
        eval_str("=LOG10(A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_pi() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=PI()", &cm, &vs),
        Value::Number(std::f64::consts::PI)
    );
    // PI takes no args.
    assert_eq!(
        eval_str("=PI(1)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Round-trip in arithmetic.
    match eval_str("=PI()*2", &cm, &vs) {
        Value::Number(n) => assert!(
            (n - 2.0 * std::f64::consts::PI).abs() < 1e-12,
            "PI()*2 = {}",
            n
        ),
        other => panic!("expected number, got {:?}", other),
    }
}
