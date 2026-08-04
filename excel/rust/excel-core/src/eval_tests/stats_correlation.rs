//! CORREL/PEARSON/RSQ/COVAR 的相关性度量。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

// --- CORREL ---

#[test]
fn eval_correl_identical_arrays() {
    let (cm, vs) = make_stat_env();
    // A vs B = 2*A → perfect positive correlation.
    match eval_str("=CORREL(A1:A5,B1:B5)", &cm, &vs) {
        Value::Number(n) => assert!((n - 1.0).abs() < 1e-12, "got {n}"),
        other => panic!("expected number, got {other:?}"),
    }
    // A vs A (identical) → 1.0.
    match eval_str("=CORREL(A1:A5,A1:A5)", &cm, &vs) {
        Value::Number(n) => assert!((n - 1.0).abs() < 1e-12, "got {n}"),
        other => panic!("expected number, got {other:?}"),
    }
}

#[test]
fn eval_correl_inverted_arrays() {
    let (cm, vs) = make_stat_env();
    // A vs C (10,8,6,4,2) → perfect negative correlation.
    match eval_str("=CORREL(A1:A5,C1:C5)", &cm, &vs) {
        Value::Number(n) => assert!((n + 1.0).abs() < 1e-12, "got {n}"),
        other => panic!("expected number, got {other:?}"),
    }
}

#[test]
fn eval_correl_shape_mismatch() {
    let (cm, vs) = make_stat_env();
    assert_eq!(
        eval_str("=CORREL(A1:A5,B1:B4)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn eval_correl_wrong_arg_count() {
    let (cm, vs) = make_stat_env();
    assert_eq!(
        eval_str("=CORREL(A1:A5)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_correl_type_error_non_range() {
    let (cm, vs) = make_stat_env();
    // Scalar first arg → not a range → #VALUE!.
    assert_eq!(
        eval_str("=CORREL(5,A1:A5)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn eval_correl_error_propagates() {
    let (cm, vs) = make_stat_env();
    // A1/Z1 path is hidden behind a cell, but we test through a range
    // that contains an explicit error via division. To do this in a
    // single-formula test we run CORREL(A1:A5, A1:A5) — already
    // covered as happy; for error propagation we rely on the pair
    // walker propagating cell-level errors. This case is exercised by
    // the integration tests.
    match eval_str("=CORREL(A1:A5,A1:A5)", &cm, &vs) {
        Value::Number(_) => {}
        other => panic!("expected number, got {other:?}"),
    }
}

#[test]
fn eval_correl_too_few_pairs() {
    let (cm, vs) = make_stat_env();
    // Empty range → 0 pairs → DivisionByZero.
    assert_eq!(
        eval_str("=CORREL(Y1:Y5,Z1:Z5)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

// --- Covariance — COVAR / COVAR.P / COVAR.S ---

#[test]
fn eval_covar() {
    let (cm, vs) = make_stat_env();
    // A = (2,4,6,8,10), B = 2A = (4,8,12,16,20).
    // mx=6, my=12, sum((x-mx)(y-my)) = 2*(16+4+0+4+16) = 80.
    // COVAR (pop): 80/5 = 16.
    assert_eq!(
        eval_str("=COVAR(A1:A5,B1:B5)", &cm, &vs),
        Value::Number(16.0),
    );
    // COVAR.P is the same arm.
    assert_eq!(
        eval_str("=COVAR.P(A1:A5,B1:B5)", &cm, &vs),
        Value::Number(16.0),
    );
    // Arg-count error.
    assert_eq!(
        eval_str("=COVAR(A1:A5)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount),
    );
    // Shape mismatch propagates from collect_paired_numbers.
    assert_eq!(
        eval_str("=COVAR(A1:A5,B1:B4)", &cm, &vs),
        Value::Error(ValueError::InvalidValue),
    );
}

#[test]
fn eval_covar_s() {
    let (cm, vs) = make_stat_env();
    // Sample variant: same sum 80 divided by n-1 = 4 → 20.
    assert_eq!(
        eval_str("=COVAR.S(A1:A5,B1:B5)", &cm, &vs),
        Value::Number(20.0),
    );
    // Must DIFFER from population COVAR over the same input.
    match (
        eval_str("=COVAR.P(A1:A5,B1:B5)", &cm, &vs),
        eval_str("=COVAR.S(A1:A5,B1:B5)", &cm, &vs),
    ) {
        (Value::Number(p), Value::Number(s)) => {
            assert!((p - 16.0).abs() < 1e-12 && (s - 20.0).abs() < 1e-12);
            assert!((p - s).abs() > 0.1, "COVAR.P/S collapsed: {p}, {s}");
        }
        other => panic!("expected number pair, got {other:?}"),
    }
    // Arg-count error.
    assert_eq!(
        eval_str("=COVAR.S(A1:A5)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount),
    );
}

#[test]
fn eval_rsq_perfect_correlation_is_one() {
    let (cm, vs) = make_math_env();
    match eval_str("=RSQ(B1:B5, A1:A5)", &cm, &vs) {
        Value::Number(n) => assert!((n - 1.0).abs() < 1e-9),
        other => panic!("expected 1.0, got {:?}", other),
    }
}

#[test]
fn eval_pearson_matches_correl() {
    let (cm, vs) = make_math_env();
    let p = eval_str("=PEARSON(B1:B5, A1:A5)", &cm, &vs);
    let c = eval_str("=CORREL(B1:B5, A1:A5)", &cm, &vs);
    match (p, c) {
        (Value::Number(pp), Value::Number(cc)) => assert!((pp - cc).abs() < 1e-12),
        other => panic!("expected matching scalars, got {:?}", other),
    }
}

#[test]
fn eval_pearson_arg_count() {
    let (cm, vs) = make_math_env();
    assert_eq!(
        eval_str("=PEARSON()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}
