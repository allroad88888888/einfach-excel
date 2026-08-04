//! CHISQ/GAMMA/EXPON/WEIBULL/BETA 的连续分布。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_chisq_dist_cdf_finite() {
    match ev("=CHISQ.DIST(3, 5, TRUE)") {
        Value::Number(n) => assert!(n > 0.0 && n < 1.0),
        other => panic!("{:?}", other),
    }
}

#[test]
fn eval_chisq_dist_rt_complement() {
    let a = match ev("=CHISQ.DIST(3, 5, TRUE)") {
        Value::Number(n) => n,
        other => panic!("{:?}", other),
    };
    let b = match ev("=CHISQ.DIST.RT(3, 5)") {
        Value::Number(n) => n,
        other => panic!("{:?}", other),
    };
    assert!((a + b - 1.0).abs() < 1e-9);
}

#[test]
fn eval_chisq_inv_df_zero_is_error() {
    assert_eq!(ev("=CHISQ.INV(0.5, 0)"), Value::Error(ValueError::Overflow));
}

#[test]
fn eval_chisq_inv_rt_p_one_is_zero() {
    // P=1 means we want the value such that survival = 1, i.e. x = 0.
    assert_approx_eq(ev("=CHISQ.INV.RT(1, 5)"), 0.0, TOL);
}

#[test]
fn eval_expon_dist_pdf_zero_is_lambda() {
    // PDF(0) = lambda.
    assert_approx_eq(ev("=EXPON.DIST(0, 2, FALSE)"), 2.0, TOL);
}

#[test]
fn eval_expon_dist_cdf_known_value() {
    // CDF(x; λ) = 1 - exp(-λx). CDF(1; 1) = 1 - 1/e ≈ 0.6321205588.
    assert_approx_eq(ev("=EXPON.DIST(1, 1, TRUE)"), 0.632_120_558_8, TOL);
}

#[test]
fn eval_expon_dist_lambda_zero_is_error() {
    assert_eq!(
        ev("=EXPON.DIST(1, 0, TRUE)"),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_weibull_dist_cdf_at_scale() {
    // CDF(beta; alpha, beta) = 1 - exp(-1) ≈ 0.6321205588 for any alpha.
    assert_approx_eq(ev("=WEIBULL.DIST(2, 3, 2, TRUE)"), 0.632_120_558_8, TOL);
}

#[test]
fn eval_weibull_dist_alpha_zero_is_error() {
    assert_eq!(
        ev("=WEIBULL.DIST(1, 0, 1, TRUE)"),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_beta_dist_uniform_cdf() {
    // Beta(1, 1) on [0,1] is the uniform distribution → CDF(x) = x.
    assert_approx_eq(ev("=BETA.DIST(0.25, 1, 1, TRUE)"), 0.25, TOL);
}

#[test]
fn eval_beta_dist_uniform_pdf() {
    assert_approx_eq(ev("=BETA.DIST(0.5, 1, 1, FALSE)"), 1.0, TOL);
}

#[test]
fn eval_beta_dist_with_ab() {
    // Beta(1,1) on [2,4] → uniform on [2,4] → CDF(3) = (3-2)/(4-2) = 0.5.
    assert_approx_eq(ev("=BETA.DIST(3, 1, 1, TRUE, 2, 4)"), 0.5, TOL);
}

#[test]
fn eval_beta_dist_x_outside_range_is_error() {
    assert_eq!(
        ev("=BETA.DIST(2, 1, 1, TRUE, 0, 1)"),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_beta_inv_uniform() {
    // Uniform → inverse = p. statrs's default inverse_cdf is a 16-step
    // bisection — accurate to ~1e-4, not 1e-6.
    assert_approx_eq(ev("=BETA.INV(0.3, 1, 1)"), 0.3, 1e-3);
}

#[test]
fn eval_beta_inv_with_ab() {
    assert_approx_eq(ev("=BETA.INV(0.5, 1, 1, 2, 4)"), 3.0, 1e-3);
}

#[test]
fn eval_gamma_dist_exponential_equivalent() {
    // Gamma(1, beta) is the exponential distribution with rate 1/beta.
    // CDF(1; alpha=1, beta=1) = 1 - exp(-1) ≈ 0.6321...
    assert_approx_eq(ev("=GAMMA.DIST(1, 1, 1, TRUE)"), 0.632_120_558_8, TOL);
}

#[test]
fn eval_gamma_dist_alpha_zero_is_error() {
    assert_eq!(
        ev("=GAMMA.DIST(1, 0, 1, TRUE)"),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_gamma_inv_round_trip() {
    // GAMMA.INV(GAMMA.DIST(2; 3, 2, TRUE), 3, 2) ≈ 2.
    let p = match ev("=GAMMA.DIST(2, 3, 2, TRUE)") {
        Value::Number(n) => n,
        other => panic!("{:?}", other),
    };
    let inv = match ev(&format!("=GAMMA.INV({}, 3, 2)", p)) {
        Value::Number(n) => n,
        other => panic!("{:?}", other),
    };
    assert!((inv - 2.0).abs() < 1e-3);
}
