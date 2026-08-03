//! ODDFPRICE/ODDFYIELD/ODDLPRICE/ODDLYIELD 的非整付息期。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

// ----- R batch: odd-coupon bond + CJK byte text functions ----------------

// ODDFPRICE — sanity: when issue ≈ first_coupon - 1 period and
// yield == rate, the short-odd path collapses to the standard PRICE
// case and should return ~100.
#[test]
fn eval_oddfprice_short_at_par() {
    let (cm, vs) = make_test_env();
    // 5-year semi bond, issue exactly one period before first coupon.
    let v = eval_str(
        "=ODDFPRICE(DATE(2020,7,1),DATE(2025,7,1),DATE(2020,1,1),DATE(2021,1,1),0.05,0.05,100,2,0)",
        &cm, &vs,
    );
    match v {
        Value::Number(n) => assert!((n - 100.0).abs() < 1.0, "ODDFPRICE got {}", n),
        other => panic!("ODDFPRICE: {:?}", other),
    }
}

#[test]
fn eval_oddfprice_wrong_arg_count() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=ODDFPRICE(DATE(2020,1,1))", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_oddfprice_settlement_after_first_coupon() {
    let (cm, vs) = make_test_env();
    // settlement must be < first_coupon.
    assert_eq!(
        eval_str(
            "=ODDFPRICE(DATE(2022,7,1),DATE(2025,7,1),DATE(2020,1,1),DATE(2021,1,1),0.05,0.05,100,2,0)",
            &cm, &vs
        ),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_oddfyield_inverts_oddfprice() {
    let (cm, vs) = make_test_env();
    // PRICE-then-YIELD round-trip; tolerance loose because the
    // odd-period scheme is sensitive to basis quantization.
    let v = eval_str(
        "=ODDFYIELD(DATE(2020,7,1),DATE(2025,7,1),DATE(2020,1,1),DATE(2021,1,1),0.05,ODDFPRICE(DATE(2020,7,1),DATE(2025,7,1),DATE(2020,1,1),DATE(2021,1,1),0.05,0.07,100,2,0),100,2,0)",
        &cm, &vs,
    );
    match v {
        Value::Number(n) => assert!((n - 0.07).abs() < 1e-3, "ODDFYIELD got {}", n),
        other => panic!("ODDFYIELD: {:?}", other),
    }
}

#[test]
fn eval_oddfyield_wrong_arg_count() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=ODDFYIELD(DATE(2020,1,1))", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_oddfyield_invalid_frequency() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str(
            "=ODDFYIELD(DATE(2020,7,1),DATE(2025,7,1),DATE(2020,1,1),DATE(2021,1,1),0.05,100,100,3,0)",
            &cm, &vs
        ),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_oddlprice_at_par() {
    let (cm, vs) = make_test_env();
    // last_interest exactly one period before maturity, settlement
    // mid-period, yield == rate → price ≈ 100 + ~half-period accrued.
    let v = eval_str(
        "=ODDLPRICE(DATE(2024,7,1),DATE(2025,1,1),DATE(2024,1,1),0.05,0.05,100,2,0)",
        &cm,
        &vs,
    );
    match v {
        Value::Number(n) => assert!(n > 95.0 && n < 105.0, "ODDLPRICE got {}", n),
        other => panic!("ODDLPRICE: {:?}", other),
    }
}

#[test]
fn eval_oddlprice_wrong_arg_count() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=ODDLPRICE(DATE(2020,1,1))", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_oddlprice_last_interest_after_settlement() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str(
            "=ODDLPRICE(DATE(2024,1,1),DATE(2025,1,1),DATE(2024,7,1),0.05,0.05,100,2,0)",
            &cm,
            &vs
        ),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_oddlyield_round_trip() {
    let (cm, vs) = make_test_env();
    let v = eval_str(
        "=ODDLYIELD(DATE(2024,7,1),DATE(2025,1,1),DATE(2024,1,1),0.05,ODDLPRICE(DATE(2024,7,1),DATE(2025,1,1),DATE(2024,1,1),0.05,0.06,100,2,0),100,2,0)",
        &cm, &vs,
    );
    match v {
        Value::Number(n) => assert!((n - 0.06).abs() < 1e-4, "ODDLYIELD got {}", n),
        other => panic!("ODDLYIELD: {:?}", other),
    }
}

#[test]
fn eval_oddlyield_wrong_arg_count() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=ODDLYIELD(DATE(2020,1,1))", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_oddlyield_zero_price_is_error() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str(
            "=ODDLYIELD(DATE(2024,7,1),DATE(2025,1,1),DATE(2024,1,1),0.05,0,100,2,0)",
            &cm,
            &vs
        ),
        Value::Error(ValueError::Overflow)
    );
}
