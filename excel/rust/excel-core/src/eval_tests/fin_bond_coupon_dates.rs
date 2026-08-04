//! COUPDAYBS/COUPDAYS/COUPDAYSNC/COUPNUM/COUPNCD/COUPPCD 的付息日历。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_coupdaybs_happy_path() {
    let (cm, vs) = make_test_env();
    // Maturity 2020-07-01, frequency 2 → coupons on 01-Jan and 01-Jul.
    // Settlement 2020-04-01 → days since 01-Jan = 91 (actual days).
    match eval_str("=COUPDAYBS(DATE(2020,4,1),DATE(2025,1,1),2,1)", &cm, &vs) {
        Value::Number(n) => assert!(n >= 89.0 && n <= 92.0, "COUPDAYBS got {}", n),
        other => panic!("COUPDAYBS: {:?}", other),
    }
}

#[test]
fn eval_coupdaybs_wrong_arg_count() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=COUPDAYBS(DATE(2020,4,1))", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_coupdaybs_invalid_frequency() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=COUPDAYBS(DATE(2020,4,1),DATE(2025,1,1),3)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_coupdays_basis_0() {
    let (cm, vs) = make_test_env();
    // basis 0 → 360/freq. freq=2 → 180.
    match eval_str("=COUPDAYS(DATE(2020,4,1),DATE(2025,1,1),2,0)", &cm, &vs) {
        Value::Number(n) => assert!((n - 180.0).abs() < 1e-9, "COUPDAYS basis0 got {}", n),
        other => panic!("COUPDAYS basis0: {:?}", other),
    }
}

#[test]
fn eval_coupdays_wrong_arg_count() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=COUPDAYS(DATE(2020,4,1))", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_coupdays_type_error() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=COUPDAYS(DATE(2020,4,1),DATE(2025,1,1),B2)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
}

#[test]
fn eval_coupnum_5_years_semiannual() {
    let (cm, vs) = make_test_env();
    // 5 years × 2 = 10 coupons remaining.
    match eval_str("=COUPNUM(DATE(2020,1,1),DATE(2025,1,1),2,0)", &cm, &vs) {
        Value::Number(n) => assert!((n - 10.0).abs() < 1e-9, "COUPNUM got {}", n),
        other => panic!("COUPNUM: {:?}", other),
    }
}

#[test]
fn eval_coupnum_wrong_arg_count() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=COUPNUM(DATE(2020,1,1))", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_coupnum_settlement_after_maturity() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=COUPNUM(DATE(2025,1,1),DATE(2020,1,1),2)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
}

// COUPNCD / COUPPCD / COUPDAYSNC
#[test]
fn eval_coupncd_basic() {
    let (cm, vs) = make_test_env();
    // Settlement mid-period; NCD should be > settlement.
    match eval_str("=COUPNCD(DATE(2024,4,1),DATE(2025,1,1),2,0)", &cm, &vs) {
        Value::Number(n) => {
            let settle = eval_str("=DATE(2024,4,1)", &cm, &vs);
            if let Value::Number(s) = settle {
                assert!(n > s, "COUPNCD {} should be > settle {}", n, s);
            }
        }
        other => panic!("COUPNCD: {:?}", other),
    }
}

#[test]
fn eval_couppcd_basic() {
    let (cm, vs) = make_test_env();
    match eval_str("=COUPPCD(DATE(2024,4,1),DATE(2025,1,1),2,0)", &cm, &vs) {
        Value::Number(n) => {
            let settle = eval_str("=DATE(2024,4,1)", &cm, &vs);
            if let Value::Number(s) = settle {
                assert!(n <= s, "COUPPCD {} should be <= settle {}", n, s);
            }
        }
        other => panic!("COUPPCD: {:?}", other),
    }
}

#[test]
fn eval_coupdaysnc_basis_0() {
    let (cm, vs) = make_test_env();
    // Same setup as COUPDAYS / COUPDAYBS — DSC should be positive.
    match eval_str("=COUPDAYSNC(DATE(2024,4,1),DATE(2025,1,1),2,0)", &cm, &vs) {
        Value::Number(n) => assert!(n > 0.0 && n <= 180.0, "COUPDAYSNC got {}", n),
        other => panic!("COUPDAYSNC: {:?}", other),
    }
}

#[test]
fn eval_coupncd_settle_after_mat() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=COUPNCD(DATE(2025,1,1),DATE(2024,1,1),2,0)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_coupdaysnc_invalid_frequency() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=COUPDAYSNC(DATE(2024,1,1),DATE(2025,1,1),3,0)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
}
