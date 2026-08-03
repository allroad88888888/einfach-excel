//! TDIST/TINV/FDIST/FINV 旧名的抽样分布别名。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_legacy_fdist_right_tail() {
    // FDIST(x, df1, df2) == F.DIST.RT(x, df1, df2).
    let a = match ev("=FDIST(2, 5, 10)") {
        Value::Number(n) => n,
        other => panic!("{:?}", other),
    };
    let b = match ev("=F.DIST.RT(2, 5, 10)") {
        Value::Number(n) => n,
        other => panic!("{:?}", other),
    };
    assert!((a - b).abs() < 1e-12);
}

#[test]
fn eval_legacy_fdist_negative_x_is_error() {
    assert_eq!(ev("=FDIST(-1, 5, 10)"), Value::Error(ValueError::Overflow));
}

#[test]
fn eval_legacy_fdist_wrong_arg_count() {
    assert_eq!(ev("=FDIST(1, 5)"), Value::Error(ValueError::WrongArgCount));
}

#[test]
fn eval_legacy_finv_right_tail() {
    let a = match ev("=FINV(0.5, 5, 10)") {
        Value::Number(n) => n,
        other => panic!("{:?}", other),
    };
    let b = match ev("=F.INV.RT(0.5, 5, 10)") {
        Value::Number(n) => n,
        other => panic!("{:?}", other),
    };
    assert!((a - b).abs() < 1e-12);
}

#[test]
fn eval_legacy_finv_p_zero_is_error() {
    assert_eq!(ev("=FINV(0, 5, 10)"), Value::Error(ValueError::Overflow));
}

#[test]
fn eval_legacy_finv_invalid_df() {
    assert_eq!(ev("=FINV(0.5, 0, 10)"), Value::Error(ValueError::Overflow));
}

#[test]
fn eval_legacy_tdist_right_tail() {
    // TDIST(0, 10, 1) = P(T>0) = 0.5 for symmetric T.
    assert_approx_eq(ev("=TDIST(0, 10, 1)"), 0.5, TOL);
}

#[test]
fn eval_legacy_tdist_two_tail() {
    // TDIST(0, 10, 2) = 2 * P(T>0) = 1.0.
    assert_approx_eq(ev("=TDIST(0, 10, 2)"), 1.0, TOL);
}

#[test]
fn eval_legacy_tdist_negative_x_is_error() {
    assert_eq!(ev("=TDIST(-1, 10, 1)"), Value::Error(ValueError::Overflow));
}

#[test]
fn eval_legacy_tdist_bad_tails_is_error() {
    assert_eq!(ev("=TDIST(1, 10, 3)"), Value::Error(ValueError::Overflow));
}

#[test]
fn eval_legacy_tinv_two_tail() {
    // TINV(1, 10) = T.INV.2T(1, 10) = 0.
    assert_approx_eq(ev("=TINV(1, 10)"), 0.0, TOL);
}

#[test]
fn eval_legacy_tinv_invalid_p() {
    assert_eq!(ev("=TINV(0, 10)"), Value::Error(ValueError::Overflow));
}

#[test]
fn eval_legacy_tinv_invalid_df() {
    assert_eq!(ev("=TINV(0.5, 0)"), Value::Error(ValueError::Overflow));
}
