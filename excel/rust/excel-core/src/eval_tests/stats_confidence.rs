//! CONFIDENCE.NORM 与 CONFIDENCE.T 的置信区间半宽。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_confidence_known_value() {
    // CONFIDENCE(0.05, 2.5, 50) = NORM.S.INV(0.975) * 2.5 / sqrt(50)
    //                          ≈ 1.959964 * 2.5 / 7.0711 ≈ 0.692952.
    assert_approx_eq(ev("=CONFIDENCE(0.05, 2.5, 50)"), 0.692_952, 1e-4);
}

#[test]
fn eval_confidence_norm_alias() {
    // Same arm; should match.
    let a = match ev("=CONFIDENCE(0.05, 2.5, 50)") {
        Value::Number(n) => n,
        other => panic!("{:?}", other),
    };
    let b = match ev("=CONFIDENCE.NORM(0.05, 2.5, 50)") {
        Value::Number(n) => n,
        other => panic!("{:?}", other),
    };
    assert!((a - b).abs() < 1e-12);
}

#[test]
fn eval_confidence_alpha_out_of_range_is_error() {
    assert_eq!(
        ev("=CONFIDENCE(0, 2.5, 50)"),
        Value::Error(ValueError::Overflow)
    );
    assert_eq!(
        ev("=CONFIDENCE(1, 2.5, 50)"),
        Value::Error(ValueError::Overflow)
    );
}

// --- CONFIDENCE.T ---

#[test]
fn confidence_t_happy_path() {
    // For α=0.05, σ=1, n=10 → t_{0.025,9} = 2.262157…
    // half-width = 2.262157 * 1 / sqrt(10) ≈ 0.7153912.
    assert_num_close("=CONFIDENCE.T(0.05, 1, 10)", 0.7153912, 1e-4);
}

#[test]
fn confidence_t_invalid_alpha() {
    assert_eq!(
        ev("=CONFIDENCE.T(0, 1, 10)"),
        Value::Error(ValueError::Overflow)
    );
    assert_eq!(
        ev("=CONFIDENCE.T(1, 1, 10)"),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn confidence_t_invalid_stdev() {
    assert_eq!(
        ev("=CONFIDENCE.T(0.05, 0, 10)"),
        Value::Error(ValueError::Overflow)
    );
    assert_eq!(
        ev("=CONFIDENCE.T(0.05, -1, 10)"),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn confidence_t_size_too_small() {
    // size = 1 → df = 0 → invalid.
    assert_eq!(
        ev("=CONFIDENCE.T(0.05, 1, 1)"),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn confidence_t_wrong_arg_count() {
    assert_eq!(
        ev("=CONFIDENCE.T(0.05, 1)"),
        Value::Error(ValueError::WrongArgCount)
    );
}
