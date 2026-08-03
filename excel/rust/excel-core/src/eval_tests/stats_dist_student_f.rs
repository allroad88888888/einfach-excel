//! T.DIST/T.INV 与 F.DIST/F.INV 的抽样分布。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_t_dist_cdf_zero_is_half() {
    // Student's t is symmetric around 0.
    assert_approx_eq(ev("=T.DIST(0, 10, TRUE)"), 0.5, TOL);
}

#[test]
fn eval_t_dist_pdf_zero_df10() {
    // PDF(0) for t with df=10 ≈ 0.389108..
    assert_approx_eq(ev("=T.DIST(0, 10, FALSE)"), 0.389_108_38, 1e-5);
}

#[test]
fn eval_t_dist_df_zero_is_num_error() {
    assert_eq!(
        ev("=T.DIST(0, 0, TRUE)"),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_t_dist_rt_zero_is_half() {
    assert_approx_eq(ev("=T.DIST.RT(0, 10)"), 0.5, TOL);
}

#[test]
fn eval_t_dist_rt_negative_x_is_error() {
    assert_eq!(ev("=T.DIST.RT(-1, 10)"), Value::Error(ValueError::Overflow));
}

#[test]
fn eval_t_dist_2t_zero_is_one() {
    // Two-tail at 0 = 2 * (1 - 0.5) = 1.
    assert_approx_eq(ev("=T.DIST.2T(0, 10)"), 1.0, TOL);
}

#[test]
fn eval_t_inv_half() {
    assert_approx_eq(ev("=T.INV(0.5, 10)"), 0.0, TOL);
}

#[test]
fn eval_t_inv_2t_one() {
    // p=1 → 1 - 1/2 = 0.5 → invCDF(0.5)=0.
    assert_approx_eq(ev("=T.INV.2T(1, 10)"), 0.0, TOL);
}

#[test]
fn eval_f_dist_cdf() {
    // F(1, 1) at x=1 has CDF=0.5 (df1=df2=1 gives a Cauchy-like).
    // Skip exact value; just check finite and in (0,1).
    match ev("=F.DIST(1, 5, 10, TRUE)") {
        Value::Number(n) => assert!(n > 0.0 && n < 1.0, "expected CDF in (0,1), got {}", n),
        other => panic!("expected number, got {:?}", other),
    }
}

#[test]
fn eval_f_dist_pdf_positive() {
    match ev("=F.DIST(1, 5, 10, FALSE)") {
        Value::Number(n) => assert!(n > 0.0, "expected positive PDF, got {}", n),
        other => panic!("expected number, got {:?}", other),
    }
}

#[test]
fn eval_f_dist_negative_x_is_error() {
    assert_eq!(
        ev("=F.DIST(-1, 5, 10, TRUE)"),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_f_dist_rt_complement() {
    // F.DIST(x, ...) + F.DIST.RT(x, ...) = 1.
    let a = match ev("=F.DIST(2, 5, 10, TRUE)") {
        Value::Number(n) => n,
        other => panic!("{:?}", other),
    };
    let b = match ev("=F.DIST.RT(2, 5, 10)") {
        Value::Number(n) => n,
        other => panic!("{:?}", other),
    };
    assert!((a + b - 1.0).abs() < 1e-9);
}

#[test]
fn eval_f_inv_round_trip() {
    // F.INV(F.DIST(2, 5, 10, TRUE), 5, 10) ≈ 2.
    // Build via two evaluations.
    let p = match ev("=F.DIST(2, 5, 10, TRUE)") {
        Value::Number(n) => n,
        other => panic!("{:?}", other),
    };
    let inv = match ev(&format!("=F.INV({}, 5, 10)", p)) {
        Value::Number(n) => n,
        other => panic!("{:?}", other),
    };
    assert!((inv - 2.0).abs() < 1e-3);
}

#[test]
fn eval_f_inv_rt_p_zero_is_error() {
    assert_eq!(
        ev("=F.INV.RT(0, 5, 10)"),
        Value::Error(ValueError::Overflow)
    );
}
