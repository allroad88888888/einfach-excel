//! NORMDIST/NORMINV/NORMSDIST/LOGNORMDIST 旧名的正态族别名。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_legacy_loginv_matches_lognorm_inv() {
    let a = match ev("=LOGNORM.INV(0.5, 1, 0.5)") {
        Value::Number(n) => n,
        other => panic!("{:?}", other),
    };
    let b = match ev("=LOGINV(0.5, 1, 0.5)") {
        Value::Number(n) => n,
        other => panic!("{:?}", other),
    };
    assert!((a - b).abs() < 1e-12);
}

#[test]
fn eval_legacy_lognormdist_cdf() {
    // LOGNORMDIST(e, 1, 0.5) is the CDF at the median → 0.5.
    assert_approx_eq(
        ev(&format!("=LOGNORMDIST({}, 1, 0.5)", std::f64::consts::E)),
        0.5,
        TOL,
    );
}

#[test]
fn eval_legacy_lognormdist_x_zero_is_error() {
    assert_eq!(
        ev("=LOGNORMDIST(0, 0, 1)"),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_legacy_lognormdist_wrong_arg_count() {
    assert_eq!(
        ev("=LOGNORMDIST(1, 0, 1, TRUE)"),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_legacy_normdist_cdf() {
    assert_approx_eq(ev("=NORMDIST(5, 5, 2, TRUE)"), 0.5, TOL);
}

#[test]
fn eval_legacy_normdist_pdf() {
    assert_approx_eq(ev("=NORMDIST(0, 0, 1, FALSE)"), 0.398_942_280_4, TOL);
}

#[test]
fn eval_legacy_normdist_sd_zero_is_error() {
    assert_eq!(
        ev("=NORMDIST(0, 0, 0, TRUE)"),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_legacy_norminv_half_is_mean() {
    assert_approx_eq(ev("=NORMINV(0.5, 5, 2)"), 5.0, TOL);
}

#[test]
fn eval_legacy_norminv_invalid_p() {
    assert_eq!(ev("=NORMINV(0, 0, 1)"), Value::Error(ValueError::Overflow));
}

#[test]
fn eval_legacy_norminv_invalid_sd() {
    assert_eq!(
        ev("=NORMINV(0.5, 0, 0)"),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_legacy_normsdist_zero_is_half() {
    // Single-arg form, always returns CDF.
    assert_approx_eq(ev("=NORMSDIST(0)"), 0.5, TOL);
}

#[test]
fn eval_legacy_normsdist_wrong_arg_count() {
    assert_eq!(
        ev("=NORMSDIST(0, TRUE)"),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_legacy_normsdist_large_positive_close_to_one() {
    match ev("=NORMSDIST(5)") {
        Value::Number(n) => assert!(n > 0.999_999 && n <= 1.0),
        other => panic!("{:?}", other),
    }
}

#[test]
fn eval_legacy_normsinv_half_is_zero() {
    assert_approx_eq(ev("=NORMSINV(0.5)"), 0.0, TOL);
}

#[test]
fn eval_legacy_normsinv_invalid_p() {
    assert_eq!(ev("=NORMSINV(0)"), Value::Error(ValueError::Overflow));
    assert_eq!(ev("=NORMSINV(1)"), Value::Error(ValueError::Overflow));
}

#[test]
fn eval_legacy_normsinv_known_value() {
    // NORMSINV(0.975) ≈ 1.959963985.
    assert_approx_eq(ev("=NORMSINV(0.975)"), 1.959_963_985, 1e-6);
}
