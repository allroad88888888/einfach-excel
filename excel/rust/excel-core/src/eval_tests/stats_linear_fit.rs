//! SLOPE/INTERCEPT/LINEST/STEYX 的线性拟合。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

// --- SLOPE / INTERCEPT ---

#[test]
fn eval_slope_basic() {
    let (cm, vs) = make_stat_env();
    // y = B = 2*A → slope (y vs x) = 2.
    match eval_str("=SLOPE(B1:B5,A1:A5)", &cm, &vs) {
        Value::Number(n) => assert!((n - 2.0).abs() < 1e-12, "got {n}"),
        other => panic!("expected number, got {other:?}"),
    }
}

#[test]
fn eval_intercept_basic() {
    let (cm, vs) = make_stat_env();
    // y = B = 2*A → intercept = 0.
    match eval_str("=INTERCEPT(B1:B5,A1:A5)", &cm, &vs) {
        Value::Number(n) => assert!(n.abs() < 1e-12, "got {n}"),
        other => panic!("expected number, got {other:?}"),
    }
}

#[test]
fn eval_slope_inverted_dataset() {
    let (cm, vs) = make_stat_env();
    // y = C = (10,8,6,4,2), x = A = (2,4,6,8,10). slope = -1.
    match eval_str("=SLOPE(C1:C5,A1:A5)", &cm, &vs) {
        Value::Number(n) => assert!((n + 1.0).abs() < 1e-12, "got {n}"),
        other => panic!("expected number, got {other:?}"),
    }
    // intercept(C, A) = mean(C) - slope*mean(A) = 6 - (-1)*6 = 12.
    match eval_str("=INTERCEPT(C1:C5,A1:A5)", &cm, &vs) {
        Value::Number(n) => assert!((n - 12.0).abs() < 1e-12, "got {n}"),
        other => panic!("expected number, got {other:?}"),
    }
}

#[test]
fn eval_slope_shape_mismatch() {
    let (cm, vs) = make_stat_env();
    assert_eq!(
        eval_str("=SLOPE(B1:B5,A1:A4)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn eval_intercept_shape_mismatch() {
    let (cm, vs) = make_stat_env();
    assert_eq!(
        eval_str("=INTERCEPT(B1:B5,A1:A4)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn eval_slope_wrong_arg_count() {
    let (cm, vs) = make_stat_env();
    assert_eq!(
        eval_str("=SLOPE(A1:A5)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_intercept_wrong_arg_count() {
    let (cm, vs) = make_stat_env();
    assert_eq!(
        eval_str("=INTERCEPT(A1:A5)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_slope_type_error_non_range() {
    let (cm, vs) = make_stat_env();
    assert_eq!(
        eval_str("=SLOPE(5,A1:A5)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn eval_intercept_type_error_non_range() {
    let (cm, vs) = make_stat_env();
    assert_eq!(
        eval_str("=INTERCEPT(5,A1:A5)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn eval_slope_too_few_pairs() {
    let (cm, vs) = make_stat_env();
    // Empty ranges → no pairs → DivisionByZero.
    assert_eq!(
        eval_str("=SLOPE(Y1:Y5,Z1:Z5)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

// ---- P batch: regression + matrix algebra ------------------------
//
// The cell-level layout used by `make_math_env` (A=1..5, B=2*A) lets
// us exercise the linear-regression family directly: slope = 2,
// intercept = 0 on a perfect fit. Matrix-shaped scenarios live in
// the dedicated `regression_matrix.rs` integration test file.

#[test]
fn eval_linest_perfect_line_returns_slope_and_intercept() {
    let (cm, vs) = make_math_env();
    // y = 2x, x = 1..5. Slope 2, intercept 0.
    match eval_str("=LINEST(B1:B5, A1:A5)", &cm, &vs) {
        Value::Array(arr) => {
            assert_eq!(arr.shape(), (1, 2));
            if let Some(Value::Number(slope)) = arr.get(0, 0) {
                assert!((slope - 2.0).abs() < 1e-9, "slope {}", slope);
            } else {
                panic!("expected number slope, got {:?}", arr.get(0, 0));
            }
            if let Some(Value::Number(b)) = arr.get(0, 1) {
                assert!(b.abs() < 1e-9, "intercept {}", b);
            } else {
                panic!("expected number intercept, got {:?}", arr.get(0, 1));
            }
        }
        other => panic!("expected Array, got {:?}", other),
    }
}

#[test]
fn eval_linest_stats_block_shape_is_5_x_kplus1() {
    let (cm, vs) = make_math_env();
    match eval_str("=LINEST(B1:B5, A1:A5, TRUE, TRUE)", &cm, &vs) {
        Value::Array(arr) => assert_eq!(arr.shape(), (5, 2)),
        other => panic!("expected 5x2 Array, got {:?}", other),
    }
}

#[test]
fn eval_linest_wrong_arg_count_surfaces_error() {
    let (cm, vs) = make_math_env();
    assert_eq!(
        eval_str("=LINEST()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_steyx_perfect_fit_is_zero() {
    let (cm, vs) = make_math_env();
    assert_eq!(
        eval_str("=STEYX(B1:B5, A1:A5)", &cm, &vs),
        Value::Number(0.0)
    );
}

#[test]
fn eval_steyx_arg_count() {
    let (cm, vs) = make_math_env();
    assert_eq!(
        eval_str("=STEYX(B1:B5)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}
