//! BINOM/POISSON/HYPGEOM/NEGBINOM 的离散分布。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_binom_dist_pmf_known() {
    // P(X=2) for Binom(10, 0.5) = C(10,2) * 0.5^10 = 45/1024 ≈ 0.0439453.
    assert_approx_eq(ev("=BINOM.DIST(2, 10, 0.5, FALSE)"), 45.0 / 1024.0, TOL);
}

#[test]
fn eval_binom_dist_cdf_full() {
    // P(X <= 10) for Binom(10, 0.5) = 1.
    assert_approx_eq(ev("=BINOM.DIST(10, 10, 0.5, TRUE)"), 1.0, TOL);
}

#[test]
fn eval_binom_dist_p_out_of_range_is_error() {
    assert_eq!(
        ev("=BINOM.DIST(1, 10, 1.5, FALSE)"),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_binom_inv_half() {
    // Smallest k with P(X<=k) >= 0.5 for Binom(10, 0.5) → k=5.
    assert_approx_eq(ev("=BINOM.INV(10, 0.5, 0.5)"), 5.0, TOL);
}

#[test]
fn eval_poisson_dist_pmf_zero() {
    // P(X=0) for Poisson(2) = e^-2 ≈ 0.1353352832.
    assert_approx_eq(ev("=POISSON.DIST(0, 2, FALSE)"), 0.135_335_283_2, TOL);
}

#[test]
fn eval_poisson_dist_mean_zero_is_error() {
    assert_eq!(
        ev("=POISSON.DIST(0, 0, FALSE)"),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_poisson_dist_wrong_arg_count() {
    assert_eq!(
        ev("=POISSON.DIST(0)"),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_hypgeom_dist_pmf() {
    // 20 balls, 6 red. Draw 5. P(exactly 2 red) = C(6,2)*C(14,3)/C(20,5)
    //   = 15 * 364 / 15504 ≈ 0.3522
    assert_approx_eq(
        ev("=HYPGEOM.DIST(2, 5, 6, 20, FALSE)"),
        15.0 * 364.0 / 15504.0,
        TOL,
    );
}

#[test]
fn eval_hypgeom_dist_sample_gt_pop_is_error() {
    assert_eq!(
        ev("=HYPGEOM.DIST(2, 5, 25, 20, FALSE)"),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_negbinom_dist_zero_failures() {
    // P(0 failures before 1st success) for prob=0.5 = 0.5.
    assert_approx_eq(ev("=NEGBINOM.DIST(0, 1, 0.5, FALSE)"), 0.5, TOL);
}

#[test]
fn eval_negbinom_dist_p_zero_is_error() {
    assert_eq!(
        ev("=NEGBINOM.DIST(0, 1, 0, FALSE)"),
        Value::Error(ValueError::Overflow)
    );
}

// --- BINOM.DIST.RANGE ---

#[test]
fn binom_dist_range_single_point() {
    // PMF(2; 10, 0.5) = C(10,2) * 0.5^10 = 45/1024 ≈ 0.043945.
    assert_num_close("=BINOM.DIST.RANGE(10, 0.5, 2)", 45.0 / 1024.0, 1e-9);
}

#[test]
fn binom_dist_range_full_sums_to_one() {
    assert_num_close("=BINOM.DIST.RANGE(10, 0.3, 0, 10)", 1.0, 1e-9);
}

#[test]
fn binom_dist_range_partial_sum() {
    // Σ_{k=0}^{3} C(10,k) 0.5^10 = (1+10+45+120)/1024 = 176/1024 ≈ 0.171875.
    assert_num_close("=BINOM.DIST.RANGE(10, 0.5, 0, 3)", 176.0 / 1024.0, 1e-9);
}

#[test]
fn binom_dist_range_invalid_bounds() {
    // upper < lower
    assert_eq!(
        ev("=BINOM.DIST.RANGE(10, 0.5, 5, 3)"),
        Value::Error(ValueError::Overflow)
    );
    // upper > trials
    assert_eq!(
        ev("=BINOM.DIST.RANGE(10, 0.5, 0, 11)"),
        Value::Error(ValueError::Overflow)
    );
    // lower < 0
    assert_eq!(
        ev("=BINOM.DIST.RANGE(10, 0.5, -1, 5)"),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn binom_dist_range_invalid_prob() {
    assert_eq!(
        ev("=BINOM.DIST.RANGE(10, 1.5, 0, 5)"),
        Value::Error(ValueError::Overflow)
    );
    assert_eq!(
        ev("=BINOM.DIST.RANGE(10, -0.1, 0, 5)"),
        Value::Error(ValueError::Overflow)
    );
}
