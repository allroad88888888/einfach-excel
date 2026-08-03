//! SUMPRODUCT 与 SUMX2MY2 系列的成对求和。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_sumx2my2() {
    let (cm, vs) = make_math_env();
    // A=1..5, B=2*A → Σ(x²-y²) = Σ(x²-4x²) = -3Σx² = -3*55 = -165.
    assert_eq!(
        eval_str("=SUMX2MY2(A1:A5,B1:B5)", &cm, &vs),
        Value::Number(-165.0),
    );
    // Arg-count error.
    assert_eq!(
        eval_str("=SUMX2MY2(A1:A5)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount),
    );
    // Shape mismatch → InvalidValue.
    assert_eq!(
        eval_str("=SUMX2MY2(A1:A5,B1:B4)", &cm, &vs),
        Value::Error(ValueError::InvalidValue),
    );
}

#[test]
fn eval_sumx2py2() {
    let (cm, vs) = make_math_env();
    // Σ(x²+y²) = Σx² + Σy² = 55 + 220 = 275.
    assert_eq!(
        eval_str("=SUMX2PY2(A1:A5,B1:B5)", &cm, &vs),
        Value::Number(275.0),
    );
    assert_eq!(
        eval_str("=SUMX2PY2(A1:A5)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount),
    );
    assert_eq!(
        eval_str("=SUMX2PY2(A1:A5,B1:B4)", &cm, &vs),
        Value::Error(ValueError::InvalidValue),
    );
}

#[test]
fn eval_sumxmy2() {
    let (cm, vs) = make_math_env();
    // Σ(x-y)² where y=2x → Σ(-x)² = Σx² = 55.
    assert_eq!(
        eval_str("=SUMXMY2(A1:A5,B1:B5)", &cm, &vs),
        Value::Number(55.0),
    );
    assert_eq!(
        eval_str("=SUMXMY2(A1:A5)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount),
    );
    assert_eq!(
        eval_str("=SUMXMY2(A1:A5,B1:B4)", &cm, &vs),
        Value::Error(ValueError::InvalidValue),
    );
}

#[test]
fn eval_sumsq() {
    let (cm, vs) = make_math_env();
    // SUMSQ(A1:A5) = 1+4+9+16+25 = 55.
    assert_eq!(eval_str("=SUMSQ(A1:A5)", &cm, &vs), Value::Number(55.0));
    // Variadic literals: 3,4 → 25.
    assert_eq!(eval_str("=SUMSQ(3,4)", &cm, &vs), Value::Number(25.0));
    // Non-numeric (text cell D1) skipped, no error.
    assert_eq!(eval_str("=SUMSQ(A1:A5,D1)", &cm, &vs), Value::Number(55.0));
    // No args → 0 (variadic empty → 0 like SUM).
    assert_eq!(eval_str("=SUMSQ()", &cm, &vs), Value::Number(0.0));
}

#[test]
fn eval_sqrtpi() {
    let (cm, vs) = make_math_env();
    // SQRTPI(1) = sqrt(PI).
    match eval_str("=SQRTPI(1)", &cm, &vs) {
        Value::Number(n) => assert!((n - std::f64::consts::PI.sqrt()).abs() < 1e-12),
        other => panic!("expected number, got {other:?}"),
    }
    // SQRTPI(0) = 0.
    assert_eq!(eval_str("=SQRTPI(0)", &cm, &vs), Value::Number(0.0));
    // Negative → #NUM!.
    assert_eq!(
        eval_str("=SQRTPI(-1)", &cm, &vs),
        Value::Error(ValueError::Overflow),
    );
    // Arg-count.
    assert_eq!(
        eval_str("=SQRTPI(1,2)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount),
    );
}

#[test]
fn eval_sumproduct() {
    let (cm, vs) = make_math_env();
    // 2 arrays: Σ x*2x = 2Σx² = 110.
    assert_eq!(
        eval_str("=SUMPRODUCT(A1:A5,B1:B5)", &cm, &vs),
        Value::Number(110.0),
    );
    // 1 array = SUM over numerics (= 15).
    assert_eq!(
        eval_str("=SUMPRODUCT(A1:A5)", &cm, &vs),
        Value::Number(15.0),
    );
    // Single-array equivalence: SUMPRODUCT(A1:A5) == SUM(A1:A5).
    assert_eq!(
        eval_str("=SUMPRODUCT(A1:A5)", &cm, &vs),
        eval_str("=SUM(A1:A5)", &cm, &vs),
    );
    // Shape mismatch → InvalidValue.
    assert_eq!(
        eval_str("=SUMPRODUCT(A1:A5,B1:B4)", &cm, &vs),
        Value::Error(ValueError::InvalidValue),
    );
    // 0 args → arg-count.
    assert_eq!(
        eval_str("=SUMPRODUCT()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount),
    );
}
