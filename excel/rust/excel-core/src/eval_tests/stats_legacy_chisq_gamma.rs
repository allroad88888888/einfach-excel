//! CHIDIST/CHIINV/GAMMADIST/EXPONDIST/WEIBULL/BETADIST 旧名别名。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

// === Legacy statistical aliases (Excel pre-2010 names) ===

#[test]
fn eval_legacy_betadist_uniform_cdf() {
    // BETA(1,1) on [0,1] = uniform → CDF(0.25) = 0.25.
    assert_approx_eq(ev("=BETADIST(0.25, 1, 1)"), 0.25, TOL);
}

#[test]
fn eval_legacy_betadist_with_ab() {
    // BETA(1,1) on [2,4] → CDF(3) = 0.5.
    assert_approx_eq(ev("=BETADIST(3, 1, 1, 2, 4)"), 0.5, TOL);
}

#[test]
fn eval_legacy_betadist_x_out_of_range_is_error() {
    assert_eq!(
        ev("=BETADIST(2, 1, 1, 0, 1)"),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_legacy_betainv_round_trip() {
    // BETAINV is just BETA.INV — uniform inverse is identity.
    assert_approx_eq(ev("=BETAINV(0.3, 1, 1)"), 0.3, 1e-3);
}

#[test]
fn eval_legacy_betainv_invalid_alpha() {
    assert_eq!(
        ev("=BETAINV(0.5, 0, 1)"),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_legacy_betainv_with_ab() {
    assert_approx_eq(ev("=BETAINV(0.5, 1, 1, 2, 4)"), 3.0, 1e-3);
}

#[test]
fn eval_legacy_chidist_complement_of_chisq_dist() {
    // CHIDIST(x, df) = 1 - CHISQ.DIST(x, df, TRUE).
    let a = match ev("=CHIDIST(3, 5)") {
        Value::Number(n) => n,
        other => panic!("{:?}", other),
    };
    let b = match ev("=CHISQ.DIST(3, 5, TRUE)") {
        Value::Number(n) => n,
        other => panic!("{:?}", other),
    };
    assert!((a + b - 1.0).abs() < 1e-9);
}

#[test]
fn eval_legacy_chidist_df_zero_is_error() {
    assert_eq!(ev("=CHIDIST(3, 0)"), Value::Error(ValueError::Overflow));
}

#[test]
fn eval_legacy_chidist_negative_x_is_error() {
    assert_eq!(ev("=CHIDIST(-1, 5)"), Value::Error(ValueError::Overflow));
}

#[test]
fn eval_legacy_chiinv_p_one_is_zero() {
    // CHIINV(p=1, df) == survival-CDF^-1(1) == 0.
    assert_approx_eq(ev("=CHIINV(1, 5)"), 0.0, TOL);
}

#[test]
fn eval_legacy_chiinv_invalid_p() {
    assert_eq!(ev("=CHIINV(0, 5)"), Value::Error(ValueError::Overflow));
}

#[test]
fn eval_legacy_chiinv_invalid_df() {
    assert_eq!(ev("=CHIINV(0.5, 0)"), Value::Error(ValueError::Overflow));
}

#[test]
fn eval_legacy_expondist_pdf() {
    assert_approx_eq(ev("=EXPONDIST(0, 2, FALSE)"), 2.0, TOL);
}

#[test]
fn eval_legacy_expondist_cdf() {
    assert_approx_eq(ev("=EXPONDIST(1, 1, TRUE)"), 0.632_120_558_8, TOL);
}

#[test]
fn eval_legacy_expondist_lambda_zero_is_error() {
    assert_eq!(
        ev("=EXPONDIST(1, 0, TRUE)"),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_legacy_gammadist_alias() {
    // GAMMADIST is just GAMMA.DIST.
    assert_approx_eq(ev("=GAMMADIST(1, 1, 1, TRUE)"), 0.632_120_558_8, TOL);
}

#[test]
fn eval_legacy_gammadist_alpha_zero_is_error() {
    assert_eq!(
        ev("=GAMMADIST(1, 0, 1, TRUE)"),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_legacy_gammainv_round_trip() {
    let p = match ev("=GAMMADIST(2, 3, 2, TRUE)") {
        Value::Number(n) => n,
        other => panic!("{:?}", other),
    };
    let inv = match ev(&format!("=GAMMAINV({}, 3, 2)", p)) {
        Value::Number(n) => n,
        other => panic!("{:?}", other),
    };
    assert!((inv - 2.0).abs() < 1e-3);
}

#[test]
fn eval_legacy_weibull_alias() {
    assert_approx_eq(ev("=WEIBULL(2, 3, 2, TRUE)"), 0.632_120_558_8, TOL);
}

#[test]
fn eval_legacy_weibull_alpha_zero_is_error() {
    assert_eq!(
        ev("=WEIBULL(1, 0, 1, TRUE)"),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_legacy_weibull_wrong_arg_count() {
    assert_eq!(
        ev("=WEIBULL(1, 1, 1)"),
        Value::Error(ValueError::WrongArgCount)
    );
}
