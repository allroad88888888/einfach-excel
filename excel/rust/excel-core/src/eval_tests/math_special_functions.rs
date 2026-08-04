//! BESSEL/ERF/GAMMA/FISHER 等特殊函数。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_gamma_func_integers() {
    // Gamma(n) = (n-1)!. Gamma(5) = 24.
    assert_approx_eq(ev("=GAMMA(5)"), 24.0, TOL);
    assert_approx_eq(ev("=GAMMA(1)"), 1.0, TOL);
}

#[test]
fn eval_gamma_func_half() {
    // Gamma(0.5) = sqrt(π).
    assert_approx_eq(ev("=GAMMA(0.5)"), std::f64::consts::PI.sqrt(), TOL);
}

#[test]
fn eval_gamma_func_zero_is_error() {
    assert_eq!(ev("=GAMMA(0)"), Value::Error(ValueError::Overflow));
}

#[test]
fn eval_gamma_func_negative_integer_is_error() {
    assert_eq!(ev("=GAMMA(-3)"), Value::Error(ValueError::Overflow));
}

#[test]
fn eval_gammaln_known() {
    // ln(Gamma(5)) = ln(24) ≈ 3.178053830347946.
    assert_approx_eq(ev("=GAMMALN(5)"), 24.0_f64.ln(), TOL);
}

#[test]
fn eval_gammaln_negative_is_error() {
    assert_eq!(ev("=GAMMALN(-1)"), Value::Error(ValueError::Overflow));
}

#[test]
fn eval_erf_one() {
    // erf(1) ≈ 0.8427007929
    assert_approx_eq(ev("=ERF(1)"), 0.842_700_792_9, TOL);
}

#[test]
fn eval_erf_zero() {
    assert_approx_eq(ev("=ERF(0)"), 0.0, TOL);
}

#[test]
fn eval_erf_two_arg() {
    // erf(2) - erf(1).
    let one = 0.842_700_792_9_f64;
    let two = 0.995_322_265_0_f64;
    assert_approx_eq(ev("=ERF(1, 2)"), two - one, 1e-5);
}

#[test]
fn eval_erfc_one() {
    // erfc(1) = 1 - erf(1) ≈ 0.1572992070.
    assert_approx_eq(ev("=ERFC(1)"), 1.0 - 0.842_700_792_9, TOL);
}

#[test]
fn eval_erfc_wrong_arg_count() {
    assert_eq!(ev("=ERFC()"), Value::Error(ValueError::WrongArgCount));
}

#[test]
fn eval_fisher_zero() {
    // FISHER(0) = 0.5 * ln(1/1) = 0.
    assert_approx_eq(ev("=FISHER(0)"), 0.0, TOL);
}

#[test]
fn eval_fisher_known() {
    // FISHER(0.75) = 0.5 * ln(1.75 / 0.25) ≈ 0.5 * ln(7) ≈ 0.9729550745.
    assert_approx_eq(ev("=FISHER(0.75)"), 0.5 * 7.0_f64.ln(), TOL);
}

#[test]
fn eval_fisher_out_of_range() {
    assert_eq!(ev("=FISHER(1)"), Value::Error(ValueError::Overflow));
    assert_eq!(ev("=FISHER(-1)"), Value::Error(ValueError::Overflow));
}

#[test]
fn eval_fisherinv_round_trip() {
    // FISHERINV(FISHER(0.5)) ≈ 0.5.
    let y = match ev("=FISHER(0.5)") {
        Value::Number(n) => n,
        other => panic!("{:?}", other),
    };
    assert_approx_eq(ev(&format!("=FISHERINV({})", y)), 0.5, TOL);
}

#[test]
fn eval_fisherinv_zero() {
    assert_approx_eq(ev("=FISHERINV(0)"), 0.0, TOL);
}

// === Bessel + CONVERT tests ===
//
// Tolerance: BESSEL_TOL = 1e-5. The hand-written rational
// approximations are good to ~1e-7 in their primary range but lose
// a couple of digits across the recurrence chain for n > 1.
// 1e-5 covers every entry in this suite with margin.

const BESSEL_TOL: f64 = 1e-5;

#[test]
fn bessel_j_basic() {
    // J_0(0) = 1 exactly.
    assert_approx_eq(ev("=BESSELJ(0, 0)"), 1.0, BESSEL_TOL);
    // J_n(0) = 0 for n >= 1.
    assert_approx_eq(ev("=BESSELJ(0, 1)"), 0.0, BESSEL_TOL);
    assert_approx_eq(ev("=BESSELJ(0, 5)"), 0.0, BESSEL_TOL);
    // First positive zero of J_0 is ≈ 2.4048255577.
    assert_approx_eq(ev("=BESSELJ(2.4048255577, 0)"), 0.0, 1e-4);
    // Known reference values (Wikipedia / DLMF tables).
    assert_approx_eq(ev("=BESSELJ(1, 0)"), 0.7651976866, BESSEL_TOL);
    assert_approx_eq(ev("=BESSELJ(1, 1)"), 0.4400505857, BESSEL_TOL);
    assert_approx_eq(ev("=BESSELJ(5, 2)"), 0.046565116278635, 1e-4);
}

#[test]
fn bessel_j_higher_order_via_recurrence() {
    // J_3(10) ≈ 0.0583789589 (forward recurrence range: n < x).
    assert_approx_eq(ev("=BESSELJ(10, 3)"), 0.0583789589, 1e-4);
    // J_5(2) ≈ 0.0070396 (Miller-downward range: n > x).
    assert_approx_eq(ev("=BESSELJ(2, 5)"), 0.0070396298635, 1e-4);
}

#[test]
fn bessel_j_truncates_order_and_rejects_negative() {
    // n is truncated toward zero, so 1.9 -> 1.
    assert_approx_eq(ev("=BESSELJ(1, 1.9)"), 0.4400505857, BESSEL_TOL);
    // Negative n is `#NUM!`.
    assert_eq!(ev("=BESSELJ(1, -1)"), Value::Error(ValueError::Overflow));
}

#[test]
fn bessel_y_basic() {
    // Y is singular at x=0 for every n -> `#NUM!`.
    assert_eq!(ev("=BESSELY(0, 0)"), Value::Error(ValueError::Overflow));
    assert_eq!(ev("=BESSELY(0, 3)"), Value::Error(ValueError::Overflow));
    // Y is undefined for x < 0 -> `#NUM!`.
    assert_eq!(ev("=BESSELY(-1, 0)"), Value::Error(ValueError::Overflow));
    // Reference: Y_0(1) ≈ 0.08825696, Y_1(1) ≈ -0.78121282.
    assert_approx_eq(ev("=BESSELY(1, 0)"), 0.0882569642, 1e-4);
    assert_approx_eq(ev("=BESSELY(1, 1)"), -0.7812128213, 1e-4);
    // Higher order via recurrence: Y_2(1) ≈ -1.6506826.
    assert_approx_eq(ev("=BESSELY(1, 2)"), -1.6506826, 1e-3);
}

#[test]
fn bessel_i_basic() {
    // I_0(0) = 1 exactly; I_n(0) = 0 for n >= 1.
    assert_approx_eq(ev("=BESSELI(0, 0)"), 1.0, BESSEL_TOL);
    assert_approx_eq(ev("=BESSELI(0, 1)"), 0.0, BESSEL_TOL);
    assert_approx_eq(ev("=BESSELI(0, 4)"), 0.0, BESSEL_TOL);
    // I_0(1) ≈ 1.2660658, I_1(1) ≈ 0.5651591.
    assert_approx_eq(ev("=BESSELI(1, 0)"), 1.2660658, BESSEL_TOL);
    assert_approx_eq(ev("=BESSELI(1, 1)"), 0.5651591, BESSEL_TOL);
    // I_3(2) ≈ 0.2127836 (Miller-downward range).
    assert_approx_eq(ev("=BESSELI(2, 3)"), 0.2127836, 1e-4);
    // Negative n -> `#NUM!`.
    assert_eq!(ev("=BESSELI(1, -1)"), Value::Error(ValueError::Overflow));
}

#[test]
fn bessel_k_basic() {
    // Singular at x=0 -> `#NUM!`.
    assert_eq!(ev("=BESSELK(0, 0)"), Value::Error(ValueError::Overflow));
    // K_0(1) ≈ 0.42102443, K_1(1) ≈ 0.60190723.
    assert_approx_eq(ev("=BESSELK(1, 0)"), 0.42102443, 1e-4);
    assert_approx_eq(ev("=BESSELK(1, 1)"), 0.60190723, 1e-4);
    // K_2(1) ≈ 1.6248389 (forward recurrence).
    assert_approx_eq(ev("=BESSELK(1, 2)"), 1.6248389, 1e-3);
}

#[test]
fn bessel_arg_count_errors() {
    assert_eq!(ev("=BESSELJ()"), Value::Error(ValueError::WrongArgCount));
    assert_eq!(ev("=BESSELJ(1)"), Value::Error(ValueError::WrongArgCount));
    assert_eq!(
        ev("=BESSELJ(1, 0, 2)"),
        Value::Error(ValueError::WrongArgCount)
    );
}

// --- ERF.PRECISE / ERFC.PRECISE / GAMMALN.PRECISE aliases ---

#[test]
fn erf_precise_matches_erf() {
    assert_eq!(ev("=ERF.PRECISE(0.5)"), ev("=ERF(0.5)"));
    assert_eq!(ev("=ERF.PRECISE(0)"), ev("=ERF(0)"));
}

#[test]
fn erfc_precise_matches_erfc() {
    assert_eq!(ev("=ERFC.PRECISE(0.5)"), ev("=ERFC(0.5)"));
    assert_eq!(ev("=ERFC.PRECISE(2)"), ev("=ERFC(2)"));
}

#[test]
fn gammaln_precise_matches_gammaln() {
    assert_eq!(ev("=GAMMALN.PRECISE(5)"), ev("=GAMMALN(5)"));
}
