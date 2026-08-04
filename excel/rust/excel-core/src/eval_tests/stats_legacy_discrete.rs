//! BINOMDIST/CRITBINOM/POISSON/HYPGEOMDIST/NEGBINOMDIST 旧名别名。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_legacy_binomdist_pmf() {
    // Same numbers as BINOM.DIST.
    assert_approx_eq(ev("=BINOMDIST(2, 10, 0.5, FALSE)"), 45.0 / 1024.0, TOL);
}

#[test]
fn eval_legacy_binomdist_cumulative() {
    assert_approx_eq(ev("=BINOMDIST(10, 10, 0.5, TRUE)"), 1.0, TOL);
}

#[test]
fn eval_legacy_binomdist_invalid_p() {
    assert_eq!(
        ev("=BINOMDIST(1, 10, 1.5, FALSE)"),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_legacy_critbinom_half() {
    assert_approx_eq(ev("=CRITBINOM(10, 0.5, 0.5)"), 5.0, TOL);
}

#[test]
fn eval_legacy_critbinom_invalid_alpha() {
    assert_eq!(
        ev("=CRITBINOM(10, 0.5, 0)"),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_legacy_critbinom_extremes() {
    // alpha very close to 1: should pick the largest k.
    assert_approx_eq(ev("=CRITBINOM(10, 0.5, 0.999)"), 9.0, TOL);
}

#[test]
fn eval_legacy_hypgeomdist_pmf() {
    // 4-arg form (no cumulative); matches the cumulative=FALSE arm
    // of HYPGEOM.DIST.
    assert_approx_eq(ev("=HYPGEOMDIST(2, 5, 6, 20)"), 15.0 * 364.0 / 15504.0, TOL);
}

#[test]
fn eval_legacy_hypgeomdist_wrong_arg_count() {
    assert_eq!(
        ev("=HYPGEOMDIST(2, 5, 6, 20, FALSE)"),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_legacy_hypgeomdist_invalid_sample_size() {
    assert_eq!(
        ev("=HYPGEOMDIST(2, 5, 25, 20)"),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_legacy_negbinomdist_zero_failures() {
    // P(0 failures before 1st success) for p=0.5 = 0.5.
    assert_approx_eq(ev("=NEGBINOMDIST(0, 1, 0.5)"), 0.5, TOL);
}

#[test]
fn eval_legacy_negbinomdist_wrong_arg_count() {
    // Legacy 3-arg only; reject 4 args.
    assert_eq!(
        ev("=NEGBINOMDIST(0, 1, 0.5, FALSE)"),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_legacy_negbinomdist_p_zero_is_error() {
    assert_eq!(
        ev("=NEGBINOMDIST(0, 1, 0)"),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_legacy_poisson_pmf() {
    // POISSON(0, 2, FALSE) = e^-2.
    assert_approx_eq(ev("=POISSON(0, 2, FALSE)"), 0.135_335_283_2, TOL);
}

#[test]
fn eval_legacy_poisson_cdf() {
    // POISSON(10, 2, TRUE) should be very close to 1.
    match ev("=POISSON(10, 2, TRUE)") {
        Value::Number(n) => assert!(n > 0.999 && n <= 1.0),
        other => panic!("{:?}", other),
    }
}

#[test]
fn eval_legacy_poisson_mean_zero_is_error() {
    assert_eq!(
        ev("=POISSON(0, 0, FALSE)"),
        Value::Error(ValueError::Overflow)
    );
}
