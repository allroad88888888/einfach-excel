//! STDEV/VAR 各变体的离散度。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

// --- Sample-variance aliases — STDEV.S / VAR.S ---

#[test]
fn eval_stdev_s() {
    let (cm, vs) = make_stat_env();
    // STDEV.S is an alias for STDEV (sample, divides by n-1).
    // A1..A5 = 2,4,6,8,10 → mean=6, sumsq=40, var=40/4=10 → sd=√10.
    match eval_str("=STDEV.S(A1:A5)", &cm, &vs) {
        Value::Number(n) => assert!((n - 10f64.sqrt()).abs() < 1e-12, "got {n}"),
        other => panic!("STDEV.S: {other:?}"),
    }
    // Must agree numerically with STDEV.
    assert_eq!(
        eval_str("=STDEV.S(A1:A5)", &cm, &vs),
        eval_str("=STDEV(A1:A5)", &cm, &vs),
    );
    // Arg-count handling is inherited from STDEV — at least one numeric
    // value is required (collect_numbers returns empty → InvalidValue).
    assert_eq!(
        eval_str("=STDEV.S(D3)", &cm, &vs),
        Value::Error(ValueError::InvalidValue),
    );
}

#[test]
fn eval_var_s() {
    let (cm, vs) = make_stat_env();
    // VAR.S aliases VAR (sample). A1..A5 = 2,4,6,8,10 → var = 10.
    assert_eq!(eval_str("=VAR.S(A1:A5)", &cm, &vs), Value::Number(10.0));
    assert_eq!(
        eval_str("=VAR.S(A1:A5)", &cm, &vs),
        eval_str("=VAR(A1:A5)", &cm, &vs),
    );
    assert_eq!(
        eval_str("=VAR.S(D3)", &cm, &vs),
        Value::Error(ValueError::InvalidValue),
    );
}

// --- Population variance — STDEV.P / VAR.P ---
//
// Wikipedia's canonical example: {2, 4, 4, 4, 5, 5, 7, 9}.
// mean = 5; sum of squared deviations = 32.
// Population: var = 32/8 = 4, sd = 2.
// Sample:    var = 32/7,    sd = √(32/7) ≈ 2.1381.

#[test]
fn eval_stdev_p() {
    let (cm, vs) = make_stat_env();
    // STDEV.P over inline args: {2,4,4,4,5,5,7,9} → pop SD = 2.
    assert_eq!(
        eval_str("=STDEV.P(2,4,4,4,5,5,7,9)", &cm, &vs),
        Value::Number(2.0),
    );
    // Must DIFFER from sample STDEV / STDEV.S over the same input.
    match eval_str("=STDEV.S(2,4,4,4,5,5,7,9)", &cm, &vs) {
        Value::Number(sample) => {
            assert!((sample - (32f64 / 7.0).sqrt()).abs() < 1e-12);
            assert!((sample - 2.0).abs() > 0.1, "STDEV.P/S collapsed: {sample}");
        }
        other => panic!("STDEV.S: {other:?}"),
    }
    // Single value: pop SD is well-defined (= 0); sample SD is not.
    assert_eq!(eval_str("=STDEV.P(7)", &cm, &vs), Value::Number(0.0));
    // Empty input → InvalidValue.
    assert_eq!(
        eval_str("=STDEV.P(D3)", &cm, &vs),
        Value::Error(ValueError::InvalidValue),
    );
}

#[test]
fn eval_var_p() {
    let (cm, vs) = make_stat_env();
    // VAR.P over {2,4,4,4,5,5,7,9} → 4.
    assert_eq!(
        eval_str("=VAR.P(2,4,4,4,5,5,7,9)", &cm, &vs),
        Value::Number(4.0),
    );
    // Sample VAR.S differs from pop VAR.P over the same input.
    match eval_str("=VAR.S(2,4,4,4,5,5,7,9)", &cm, &vs) {
        Value::Number(sample) => {
            assert!((sample - 32f64 / 7.0).abs() < 1e-12);
            assert!((sample - 4.0).abs() > 0.1, "VAR.P/S collapsed: {sample}");
        }
        other => panic!("VAR.S: {other:?}"),
    }
    assert_eq!(eval_str("=VAR.P(7)", &cm, &vs), Value::Number(0.0));
    assert_eq!(
        eval_str("=VAR.P(D3)", &cm, &vs),
        Value::Error(ValueError::InvalidValue),
    );
}

// --- STDEVA / STDEVPA / VARA / VARPA ---

#[test]
fn stdeva_matches_stdev_when_all_numeric() {
    let (cm, vs) = make_test_env();
    let a = eval_str("=STDEV.S({1,2,3,4,5})", &cm, &vs);
    let b = eval_str("=STDEVA({1,2,3,4,5})", &cm, &vs);
    match (a, b) {
        (Value::Number(x), Value::Number(y)) => {
            assert!(approx(x, y, 1e-12), "STDEV.S={} STDEVA={}", x, y);
        }
        other => panic!("{:?}", other),
    }
}

#[test]
fn vara_includes_logical_zero() {
    let (cm, vs) = make_test_env();
    // {1, FALSE, 3} → values [1, 0, 3], mean=4/3, var = sum((x-mean)^2)/2.
    // Compute: differences = (-1/3)^2 + (-4/3)^2 + (5/3)^2
    //                     = 1/9 + 16/9 + 25/9 = 42/9.
    // var = (42/9) / 2 = 21/9 ≈ 2.3333.
    match eval_str("=VARA({1, FALSE, 3})", &cm, &vs) {
        Value::Number(n) => assert!(approx(n, 21.0 / 9.0, 1e-9), "got {}", n),
        other => panic!("{:?}", other),
    }
}

#[test]
fn stdevpa_empty_input_is_div_by_zero() {
    let (cm, vs) = make_test_env();
    // No values at all → DivisionByZero.
    assert_eq!(
        eval_str("=STDEVPA()", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn varpa_single_value_returns_zero() {
    let (cm, vs) = make_test_env();
    // Population variance over a single point is 0 (no spread).
    match eval_str("=VARPA({5})", &cm, &vs) {
        Value::Number(n) => assert!(approx(n, 0.0, 1e-12)),
        other => panic!("{:?}", other),
    }
}

// --- STDEVP / VARP aliases ---

#[test]
fn stdevp_matches_stdev_p() {
    let canonical = ev("=STDEV.P(2, 4, 4, 4, 5, 5, 7, 9)");
    let alias = ev("=STDEVP(2, 4, 4, 4, 5, 5, 7, 9)");
    assert_eq!(canonical, alias);
}

#[test]
fn varp_matches_var_p() {
    let canonical = ev("=VAR.P(2, 4, 4, 4, 5, 5, 7, 9)");
    let alias = ev("=VARP(2, 4, 4, 4, 5, 5, 7, 9)");
    assert_eq!(canonical, alias);
}
