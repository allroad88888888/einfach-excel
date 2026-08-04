//! AMORDEGRC 的参数校验错误。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_amordegrc_purchased_after_first_period_errors() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str(
            // purchased = 2009-01-01 > first_period = 2008-12-31.
            "=AMORDEGRC(2400,DATE(2009,1,1),DATE(2008,12,31),300,0,0.15,1)",
            &cm,
            &vs
        ),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_amordegrc_rate_zero_errors() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str(
            "=AMORDEGRC(2400,DATE(2008,8,19),DATE(2008,12,31),300,0,0)",
            &cm,
            &vs
        ),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_amordegrc_rate_negative_errors() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str(
            "=AMORDEGRC(2400,DATE(2008,8,19),DATE(2008,12,31),300,0,-0.1)",
            &cm,
            &vs
        ),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_amordegrc_rate_one_or_more_errors() {
    // rate >= 1 → #NUM!  (life would be <= 1).
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str(
            "=AMORDEGRC(2400,DATE(2008,8,19),DATE(2008,12,31),300,0,1)",
            &cm,
            &vs
        ),
        Value::Error(ValueError::Overflow)
    );
    assert_eq!(
        eval_str(
            "=AMORDEGRC(2400,DATE(2008,8,19),DATE(2008,12,31),300,0,1.5)",
            &cm,
            &vs
        ),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_amordegrc_cost_zero_or_negative_errors() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str(
            "=AMORDEGRC(0,DATE(2008,8,19),DATE(2008,12,31),0,0,0.15)",
            &cm,
            &vs
        ),
        Value::Error(ValueError::Overflow)
    );
    assert_eq!(
        eval_str(
            "=AMORDEGRC(-100,DATE(2008,8,19),DATE(2008,12,31),0,0,0.15)",
            &cm,
            &vs
        ),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_amordegrc_salvage_negative_errors() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str(
            "=AMORDEGRC(2400,DATE(2008,8,19),DATE(2008,12,31),-1,0,0.15)",
            &cm,
            &vs
        ),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_amordegrc_period_negative_errors() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str(
            "=AMORDEGRC(2400,DATE(2008,8,19),DATE(2008,12,31),300,-1,0.15)",
            &cm,
            &vs
        ),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_amordegrc_invalid_basis_errors() {
    let (cm, vs) = make_test_env();
    // basis 5 not in 0..=4 → #VALUE! via fin_basis.
    assert_eq!(
        eval_str(
            "=AMORDEGRC(2400,DATE(2008,8,19),DATE(2008,12,31),300,0,0.15,5)",
            &cm,
            &vs
        ),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn eval_amordegrc_wrong_arg_count() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=AMORDEGRC(2400)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_amordegrc_type_error() {
    // B2 = "text" → numeric coercion failure → #TYPE!.
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str(
            "=AMORDEGRC(B2,DATE(2008,8,19),DATE(2008,12,31),300,1,0.15)",
            &cm,
            &vs
        ),
        Value::Error(ValueError::WrongType)
    );
}

#[test]
fn eval_amordegrc_salvage_exceeds_cost() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str(
            "=AMORDEGRC(100,DATE(2008,8,19),DATE(2008,12,31),200,1,0.15)",
            &cm,
            &vs
        ),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_amordegrc_salvage_equals_cost_errors() {
    // salvage == cost has no depreciation to distribute → #NUM!.
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str(
            "=AMORDEGRC(100,DATE(2008,8,19),DATE(2008,12,31),100,1,0.15)",
            &cm,
            &vs
        ),
        Value::Error(ValueError::Overflow)
    );
}
