//! DOLLARDE/DOLLARFR 的分数价格转换。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_dollarde_happy_path() {
    let (cm, vs) = make_test_env();
    // 1.10 in 16ths: 1 + 10/16 = 1.625.
    match eval_str("=DOLLARDE(1.1,16)", &cm, &vs) {
        Value::Number(n) => assert!((n - 1.625).abs() < 1e-7, "DOLLARDE got {}", n),
        other => panic!("DOLLARDE: {:?}", other),
    }
}

#[test]
fn eval_dollarde_wrong_arg_count() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=DOLLARDE(1.1)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_dollarde_type_error() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=DOLLARDE(B2,16)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
}

#[test]
fn eval_dollarde_zero_fraction() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=DOLLARDE(1.1,0.5)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_dollarde_negative_fraction() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=DOLLARDE(1.1,-2)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_dollarfr_roundtrip() {
    let (cm, vs) = make_test_env();
    // DOLLARFR is the inverse of DOLLARDE.
    match eval_str("=DOLLARFR(1.625,16)", &cm, &vs) {
        Value::Number(n) => assert!((n - 1.1).abs() < 1e-7, "DOLLARFR got {}", n),
        other => panic!("DOLLARFR: {:?}", other),
    }
}

#[test]
fn eval_dollarfr_wrong_arg_count() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=DOLLARFR(1.625)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_dollarfr_zero_fraction() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=DOLLARFR(1.625,0)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}
