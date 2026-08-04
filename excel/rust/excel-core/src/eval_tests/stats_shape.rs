//! KURT/SKEW/SKEW.P 的分布形状。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_kurt_uniform_dataset() {
    // Known result for SKEW.K and KURT requires ≥ 4 points.
    // Symmetric dataset has skew ≈ 0; kurtosis of symmetric flat-ish
    // dataset is negative (platykurtic).
    let v = ev("=KURT(1, 2, 3, 4, 5, 6, 7, 8, 9, 10)");
    match v {
        Value::Number(_) => {}
        other => panic!("expected number, got {:?}", other),
    }
}

#[test]
fn eval_kurt_too_few_args_is_error() {
    assert_eq!(ev("=KURT(1, 2, 3)"), Value::Error(ValueError::Overflow));
}

#[test]
fn eval_kurt_known_value() {
    // KURT(1,2,3,4,5) — Excel returns -1.2.
    assert_approx_eq(ev("=KURT(1, 2, 3, 4, 5)"), -1.2, TOL);
}

#[test]
fn eval_skew_symmetric_is_zero() {
    assert_approx_eq(ev("=SKEW(1, 2, 3, 4, 5)"), 0.0, TOL);
}

#[test]
fn eval_skew_too_few_args_is_error() {
    assert_eq!(ev("=SKEW(1, 2)"), Value::Error(ValueError::Overflow));
}

// --- SKEW.P ---

#[test]
fn skew_p_symmetric_is_zero() {
    let (cm, vs) = make_test_env();
    // Symmetric distribution → skewness 0.
    match eval_str("=SKEW.P({1,2,3,4,5})", &cm, &vs) {
        Value::Number(n) => assert!(n.abs() < 1e-12, "got {}", n),
        other => panic!("{:?}", other),
    }
}

#[test]
fn skew_p_positive_skew() {
    let (cm, vs) = make_test_env();
    // Right-skewed: long tail on the high side.
    match eval_str("=SKEW.P({1,1,1,2,10})", &cm, &vs) {
        Value::Number(n) => assert!(n > 0.5, "expected positive skew, got {}", n),
        other => panic!("{:?}", other),
    }
}

#[test]
fn skew_p_too_few_values() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=SKEW.P({1,2})", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn skew_p_zero_variance_is_div_by_zero() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=SKEW.P({3,3,3})", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}
