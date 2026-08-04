//! YEARFRAC 与 DAYS360 的日计数基准。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_yearfrac() {
    let (cm, vs) = make_test_env();
    // basis 0 (US 30/360): one full year → 1.0.
    assert_eq!(
        eval_str("=YEARFRAC(DATE(2020,1,1),DATE(2021,1,1),0)", &cm, &vs),
        Value::Number(1.0)
    );
    // basis 4 (European 30/360): same simple form → 1.0.
    assert_eq!(
        eval_str("=YEARFRAC(DATE(2020,1,1),DATE(2021,1,1),4)", &cm, &vs),
        Value::Number(1.0)
    );
    // basis 3 (actual/365): 366 actual days / 365.
    let expected = 366.0 / 365.0;
    if let Value::Number(n) = eval_str("=YEARFRAC(DATE(2020,1,1),DATE(2021,1,1),3)", &cm, &vs) {
        assert!((n - expected).abs() < 1e-12);
    } else {
        panic!("YEARFRAC basis 3 returned non-number");
    }
    // basis 2 (actual/360): 366 / 360.
    let expected = 366.0 / 360.0;
    if let Value::Number(n) = eval_str("=YEARFRAC(DATE(2020,1,1),DATE(2021,1,1),2)", &cm, &vs) {
        assert!((n - expected).abs() < 1e-12);
    } else {
        panic!("YEARFRAC basis 2 returned non-number");
    }
    // Default basis = 0.
    assert_eq!(
        eval_str("=YEARFRAC(DATE(2020,1,1),DATE(2021,1,1))", &cm, &vs),
        Value::Number(1.0)
    );
    // Unknown basis → InvalidValue.
    assert_eq!(
        eval_str("=YEARFRAC(DATE(2020,1,1),DATE(2021,1,1),99)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // Wrong arg count.
    assert_eq!(
        eval_str("=YEARFRAC(1)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Wrong type.
    assert_eq!(
        eval_str("=YEARFRAC(\"a\",1)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    // Error propagation.
    assert_eq!(
        eval_str("=YEARFRAC(A1/C1,1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

// --- DAYS360 ---

#[test]
fn days360_one_month_us() {
    // DATE(2021,1,1) → 2021-01-01 ; DATE(2021,2,1) → 2021-02-01.
    // 30/360 ⇒ 30 days.
    assert_eq!(
        ev("=DAYS360(DATE(2021,1,1), DATE(2021,2,1))"),
        Value::Number(30.0)
    );
}

#[test]
fn days360_full_year_us() {
    assert_eq!(
        ev("=DAYS360(DATE(2020,1,1), DATE(2021,1,1))"),
        Value::Number(360.0)
    );
}

#[test]
fn days360_us_clamps_31_to_30() {
    // 2021-01-31 → treat day-of-start as 30; end is 2021-02-28 (no
    // clamp). Days = (0)*360 + (1)*30 + (28-30) = 30 - 2 = 28.
    assert_eq!(
        ev("=DAYS360(DATE(2021,1,31), DATE(2021,2,28))"),
        Value::Number(28.0)
    );
}

#[test]
fn days360_european_clamps_both() {
    // European: both 31s clamp to 30. 2021-01-31 → 2021-12-31 = 11 months
    // = 330. (US would yield 360 because d1=30 then d2=31 → d2=30.)
    // d1=31→30, d2=31→30 → (0)*360 + 11*30 + (30-30) = 330.
    assert_eq!(
        ev("=DAYS360(DATE(2021,1,31), DATE(2021,12,31), TRUE)"),
        Value::Number(330.0)
    );
}

#[test]
fn days360_negative_serial_is_error() {
    // DATE() returns InvalidValue for impossible dates; check raw input.
    assert_eq!(
        ev("=DAYS360(-1, 100)"),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn days360_wrong_arg_count() {
    assert_eq!(ev("=DAYS360()"), Value::Error(ValueError::WrongArgCount));
    assert_eq!(
        ev("=DAYS360(1, 2, 3, 4)"),
        Value::Error(ValueError::WrongArgCount)
    );
}
