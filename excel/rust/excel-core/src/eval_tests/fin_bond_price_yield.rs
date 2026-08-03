//! PRICE/YIELD 在标准付息债上的互逆。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

// ----- Bond-depth tests -------------------------------------------------
#[test]
fn eval_price_par_yields_par() {
    let (cm, vs) = make_test_env();
    // When yield == coupon rate on a bond paying coupons, price ≈ par
    // (100). This is a textbook property and is robust to our
    // simplified day-count assumptions because at an exact coupon
    // boundary A=0 and DSC=E.
    match eval_str(
        "=PRICE(DATE(2020,1,1),DATE(2025,1,1),0.05,0.05,100,2,0)",
        &cm,
        &vs,
    ) {
        Value::Number(n) => assert!((n - 100.0).abs() < 1e-2, "PRICE par got {}", n),
        other => panic!("PRICE par: {:?}", other),
    }
}

#[test]
fn eval_price_wrong_arg_count() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=PRICE(DATE(2020,1,1))", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_price_type_error() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str(
            "=PRICE(DATE(2020,1,1),DATE(2025,1,1),B2,0.05,100,2,0)",
            &cm,
            &vs
        ),
        Value::Error(ValueError::WrongType)
    );
}

#[test]
fn eval_price_invalid_frequency() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str(
            "=PRICE(DATE(2020,1,1),DATE(2025,1,1),0.05,0.05,100,3,0)",
            &cm,
            &vs
        ),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_price_settlement_after_maturity() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str(
            "=PRICE(DATE(2025,1,1),DATE(2020,1,1),0.05,0.05,100,2,0)",
            &cm,
            &vs
        ),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_price_error_propagates() {
    let (cm, vs) = make_test_env();
    // 1/0 propagates as DIV/0! through to PRICE's rate arg.
    assert_eq!(
        eval_str(
            "=PRICE(DATE(2020,1,1),DATE(2025,1,1),1/0,0.05,100,2,0)",
            &cm,
            &vs
        ),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_yield_inverts_price() {
    let (cm, vs) = make_test_env();
    // Round-trip: PRICE then YIELD should land back on the input yield.
    match eval_str(
        "=YIELD(DATE(2020,1,1),DATE(2025,1,1),0.05,PRICE(DATE(2020,1,1),DATE(2025,1,1),0.05,0.06,100,2,0),100,2,0)",
        &cm, &vs,
    ) {
        Value::Number(n) => assert!((n - 0.06).abs() < 1e-5, "YIELD round-trip got {}", n),
        other => panic!("YIELD round-trip: {:?}", other),
    }
}

#[test]
fn eval_yield_wrong_arg_count() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=YIELD(DATE(2020,1,1))", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_yield_type_error() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str(
            "=YIELD(DATE(2020,1,1),DATE(2025,1,1),0.05,B2,100,2)",
            &cm,
            &vs
        ),
        Value::Error(ValueError::WrongType)
    );
}

#[test]
fn eval_yield_settlement_after_maturity() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str(
            "=YIELD(DATE(2025,1,1),DATE(2020,1,1),0.05,100,100,2)",
            &cm,
            &vs
        ),
        Value::Error(ValueError::Overflow)
    );
}
