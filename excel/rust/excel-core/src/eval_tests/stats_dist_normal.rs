//! NORM.DIST/NORM.INV/NORM.S 与 LOGNORM 的正态族。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_norm_dist_pdf_zero_is_one_over_sqrt_2pi() {
    // Standard-normal PDF at 0 = 1/sqrt(2π) ≈ 0.39894228.
    assert_approx_eq(ev("=NORM.DIST(0, 0, 1, FALSE)"), 0.398_942_280_4, TOL);
}

#[test]
fn eval_norm_dist_cdf_at_mean_is_half() {
    assert_approx_eq(ev("=NORM.DIST(5, 5, 2, TRUE)"), 0.5, TOL);
}

#[test]
fn eval_norm_dist_sd_zero_is_num_error() {
    assert_eq!(
        ev("=NORM.DIST(0, 0, 0, TRUE)"),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_norm_dist_wrong_arg_count() {
    assert_eq!(
        ev("=NORM.DIST(0, 0, 1)"),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_norm_inv_round_trip() {
    // NORM.INV(0.5, 5, 2) == 5.
    assert_approx_eq(ev("=NORM.INV(0.5, 5, 2)"), 5.0, TOL);
}

#[test]
fn eval_norm_inv_p_out_of_range() {
    assert_eq!(ev("=NORM.INV(0, 0, 1)"), Value::Error(ValueError::Overflow));
    assert_eq!(ev("=NORM.INV(1, 0, 1)"), Value::Error(ValueError::Overflow));
}

#[test]
fn eval_norm_s_dist_cdf_zero() {
    assert_approx_eq(ev("=NORM.S.DIST(0, TRUE)"), 0.5, TOL);
}

#[test]
fn eval_norm_s_dist_pdf_zero() {
    assert_approx_eq(ev("=NORM.S.DIST(0, FALSE)"), 0.398_942_280_4, TOL);
}

#[test]
fn eval_norm_s_inv_half_is_zero() {
    assert_approx_eq(ev("=NORM.S.INV(0.5)"), 0.0, TOL);
}

#[test]
fn eval_norm_s_inv_wrong_arg_count() {
    assert_eq!(ev("=NORM.S.INV()"), Value::Error(ValueError::WrongArgCount));
}

#[test]
fn eval_lognorm_dist_cdf_at_median() {
    // LOGNORM.DIST(e, 1, 0.5, TRUE) — median of lognormal(μ=1, σ=0.5)
    // is e^1 = e, so CDF at e is exactly 0.5.
    assert_approx_eq(
        ev(&format!(
            "=LOGNORM.DIST({}, 1, 0.5, TRUE)",
            std::f64::consts::E
        )),
        0.5,
        TOL,
    );
}

#[test]
fn eval_lognorm_dist_pdf_positive() {
    match ev("=LOGNORM.DIST(1, 0, 1, FALSE)") {
        Value::Number(n) => assert!(n > 0.0),
        other => panic!("{:?}", other),
    }
}

#[test]
fn eval_lognorm_dist_x_zero_is_error() {
    // x must be > 0.
    assert_eq!(
        ev("=LOGNORM.DIST(0, 0, 1, TRUE)"),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_lognorm_inv_round_trip() {
    // LOGNORM.INV(LOGNORM.DIST(x, ...), ...) == x.
    let p = match ev("=LOGNORM.DIST(3, 1, 0.5, TRUE)") {
        Value::Number(n) => n,
        other => panic!("{:?}", other),
    };
    let inv = match ev(&format!("=LOGNORM.INV({}, 1, 0.5)", p)) {
        Value::Number(n) => n,
        other => panic!("{:?}", other),
    };
    assert!((inv - 3.0).abs() < 1e-3);
}

#[test]
fn eval_lognorm_inv_p_zero_is_error() {
    assert_eq!(
        ev("=LOGNORM.INV(0, 0, 1)"),
        Value::Error(ValueError::Overflow)
    );
}
