//! 复数测试共用的实部虚部容差断言。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;

pub(super) fn assert_complex_near(actual: Value, exp_r: f64, exp_i: f64, eps: f64) {
    let s = match actual {
        Value::Text(s) => s,
        other => panic!("expected complex Text, got {:?}", other),
    };
    let (r, i, _) =
        parse_complex(&s).unwrap_or_else(|_| panic!("could not parse result {:?}", s));
    assert!(
        (r - exp_r).abs() < eps,
        "real mismatch: got {} expected {} (full: {:?})",
        r,
        exp_r,
        s,
    );
    assert!(
        (i - exp_i).abs() < eps,
        "imag mismatch: got {} expected {} (full: {:?})",
        i,
        exp_i,
        s,
    );
}
