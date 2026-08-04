//! AVEDEV/DEVSQ/STANDARDIZE 的偏差度量。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_avedev_simple() {
    // mean = 4. |1-4|+|2-4|+|3-4|+|6-4|+|8-4| = 3+2+1+2+4 = 12. 12/5 = 2.4.
    assert_approx_eq(ev("=AVEDEV(1, 2, 3, 6, 8)"), 2.4, TOL);
}

#[test]
fn eval_avedev_empty_is_div_zero() {
    assert_eq!(ev("=AVEDEV()"), Value::Error(ValueError::DivisionByZero));
}

#[test]
fn eval_devsq_simple() {
    // mean = 3. Sum (xi - 3)^2 = 4+1+0+1+4 = 10.
    assert_approx_eq(ev("=DEVSQ(1, 2, 3, 4, 5)"), 10.0, TOL);
}

#[test]
fn eval_standardize_simple() {
    assert_approx_eq(ev("=STANDARDIZE(7, 5, 2)"), 1.0, TOL);
}

#[test]
fn eval_standardize_sd_zero_is_div_zero() {
    assert_eq!(
        ev("=STANDARDIZE(1, 0, 0)"),
        Value::Error(ValueError::DivisionByZero)
    );
}
