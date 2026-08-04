//! AMORLINC 的法国式线性折旧。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_amorlinc_happy_path() {
    let (cm, vs) = make_test_env();
    // Same shape as AMORDEGRC but no coefficient; first-period
    // depreciation should be cost*rate*frac.
    match eval_str(
        "=AMORLINC(2400,DATE(2008,8,19),DATE(2008,12,31),300,0,0.15,1)",
        &cm,
        &vs,
    ) {
        Value::Number(n) => assert!(n > 0.0 && n < 2400.0, "AMORLINC got {}", n),
        other => panic!("AMORLINC: {:?}", other),
    }
}

#[test]
fn eval_amorlinc_wrong_arg_count() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=AMORLINC(2400)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_amorlinc_type_error() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str(
            "=AMORLINC(B2,DATE(2008,8,19),DATE(2008,12,31),300,1,0.15)",
            &cm,
            &vs
        ),
        Value::Error(ValueError::WrongType)
    );
}

#[test]
fn eval_amorlinc_negative_rate() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str(
            "=AMORLINC(2400,DATE(2008,8,19),DATE(2008,12,31),300,1,-0.15)",
            &cm,
            &vs
        ),
        Value::Error(ValueError::Overflow)
    );
}
