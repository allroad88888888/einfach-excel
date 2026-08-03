//! SLN/SYD 的直线与年数总和折旧。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_sln_happy_path() {
    let (cm, vs) = make_test_env();
    // SLN(10000, 1000, 5) = (10000-1000)/5 = 1800.
    assert_eq!(
        eval_str("=SLN(10000,1000,5)", &cm, &vs),
        Value::Number(1800.0)
    );
}

#[test]
fn eval_sln_zero_life_div_by_zero() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=SLN(10000,1000,0)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
    assert_eq!(
        eval_str("=SLN(10000,1000,-1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_sln_wrong_arg_count() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=SLN(10000,1000)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_sln_type_error_propagation() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=SLN(B2,1000,5)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    assert_eq!(
        eval_str("=SLN(A1/C1,1000,5)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_syd_happy_path() {
    let (cm, vs) = make_test_env();
    // SYD(10000, 1000, 5, 1) = 9000 * (5-1+1) * 2 / (5*6) = 9000*10/30 = 3000.
    assert_eq!(
        eval_str("=SYD(10000,1000,5,1)", &cm, &vs),
        Value::Number(3000.0)
    );
    // SYD(10000, 1000, 5, 5) = 9000 * (5-5+1) * 2 / 30 = 600.
    assert_eq!(
        eval_str("=SYD(10000,1000,5,5)", &cm, &vs),
        Value::Number(600.0)
    );
}

#[test]
fn eval_syd_per_exceeds_life() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=SYD(10000,1000,5,6)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_syd_wrong_arg_count() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=SYD(10000,1000,5)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_syd_type_error() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=SYD(B2,1000,5,1)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
}
