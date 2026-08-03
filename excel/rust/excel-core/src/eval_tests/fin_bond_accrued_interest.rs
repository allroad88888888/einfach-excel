//! ACCRINT/ACCRINTM/DISC/INTRATE/RECEIVED 的应计利息与贴现。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_accrint_happy_path() {
    let (cm, vs) = make_test_env();
    // ACCRINT(DATE(2020,1,1), DATE(2020,7,1), DATE(2020,7,1), 0.1, 1000, 2)
    // basis=0 (US 30/360): yearfrac = 0.5, so accrued = 1000 * 0.1 * 0.5 = 50.
    match eval_str(
        "=ACCRINT(DATE(2020,1,1),DATE(2020,7,1),DATE(2020,7,1),0.1,1000,2)",
        &cm,
        &vs,
    ) {
        Value::Number(n) => assert!(approx(n, 50.0, 1e-2), "ACCRINT got {}", n),
        other => panic!("ACCRINT: {:?}", other),
    }
}

#[test]
fn eval_accrint_basis_3() {
    let (cm, vs) = make_test_env();
    // basis=3 (actual/365): 182 days / 365 * 1000 * 0.1 ≈ 49.863.
    match eval_str(
        "=ACCRINT(DATE(2020,1,1),DATE(2020,7,1),DATE(2020,7,1),0.1,1000,2,3)",
        &cm,
        &vs,
    ) {
        Value::Number(n) => assert!(approx(n, 49.863, 1e-2), "ACCRINT basis3 got {}", n),
        other => panic!("ACCRINT basis3: {:?}", other),
    }
}

#[test]
fn eval_accrint_wrong_arg_count() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=ACCRINT(DATE(2020,1,1),DATE(2020,7,1))", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_accrint_invalid_frequency() {
    let (cm, vs) = make_test_env();
    // frequency=3 not in {1, 2, 4}.
    assert_eq!(
        eval_str(
            "=ACCRINT(DATE(2020,1,1),DATE(2020,7,1),DATE(2020,7,1),0.1,1000,3)",
            &cm,
            &vs
        ),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_accrint_settlement_before_issue() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str(
            "=ACCRINT(DATE(2020,7,1),DATE(2020,1,1),DATE(2020,1,1),0.1,1000,2)",
            &cm,
            &vs
        ),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_accrintm_happy_path() {
    let (cm, vs) = make_test_env();
    // ACCRINTM(DATE(2020,1,1), DATE(2021,1,1), 0.1, 1000)
    // basis=0: yearfrac = 1.0 → 100.
    match eval_str(
        "=ACCRINTM(DATE(2020,1,1),DATE(2021,1,1),0.1,1000)",
        &cm,
        &vs,
    ) {
        Value::Number(n) => assert!(approx(n, 100.0, 1e-2), "ACCRINTM got {}", n),
        other => panic!("ACCRINTM: {:?}", other),
    }
}

#[test]
fn eval_accrintm_wrong_arg_count() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=ACCRINTM(DATE(2020,1,1))", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_accrintm_type_error() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=ACCRINTM(DATE(2020,1,1),DATE(2021,1,1),B2,1000)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
}

#[test]
fn eval_disc_happy_path() {
    let (cm, vs) = make_test_env();
    // DISC(DATE(2020,1,1), DATE(2021,1,1), 90, 100) at basis 0:
    // yearfrac = 1.0 → (100-90)/100/1 = 0.1.
    match eval_str("=DISC(DATE(2020,1,1),DATE(2021,1,1),90,100)", &cm, &vs) {
        Value::Number(n) => assert!(approx(n, 0.1, 1e-7), "DISC got {}", n),
        other => panic!("DISC: {:?}", other),
    }
}

#[test]
fn eval_disc_maturity_before_settlement() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=DISC(DATE(2021,1,1),DATE(2020,1,1),90,100)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_disc_wrong_arg_count() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=DISC(DATE(2020,1,1),DATE(2021,1,1),90)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_intrate_happy_path() {
    let (cm, vs) = make_test_env();
    // INTRATE(DATE(2020,1,1), DATE(2021,1,1), 1000, 1100) at basis 0:
    // (1100-1000)/1000/1 = 0.1.
    match eval_str(
        "=INTRATE(DATE(2020,1,1),DATE(2021,1,1),1000,1100)",
        &cm,
        &vs,
    ) {
        Value::Number(n) => assert!(approx(n, 0.1, 1e-7), "INTRATE got {}", n),
        other => panic!("INTRATE: {:?}", other),
    }
}

#[test]
fn eval_intrate_type_error() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=INTRATE(DATE(2020,1,1),DATE(2021,1,1),B2,1100)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
}

#[test]
fn eval_received_happy_path() {
    let (cm, vs) = make_test_env();
    // RECEIVED(DATE(2020,1,1), DATE(2021,1,1), 1000, 0.1) at basis 0:
    // 1000 / (1 - 0.1 * 1) = 1000 / 0.9 ≈ 1111.11.
    match eval_str(
        "=RECEIVED(DATE(2020,1,1),DATE(2021,1,1),1000,0.1)",
        &cm,
        &vs,
    ) {
        Value::Number(n) => assert!(approx(n, 1111.11, 1e-2), "RECEIVED got {}", n),
        other => panic!("RECEIVED: {:?}", other),
    }
}

#[test]
fn eval_received_discount_too_large() {
    let (cm, vs) = make_test_env();
    // discount * yearfrac >= 1 → denominator <= 0 → Overflow.
    assert_eq!(
        eval_str(
            "=RECEIVED(DATE(2020,1,1),DATE(2021,1,1),1000,1.5)",
            &cm,
            &vs
        ),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_received_wrong_arg_count() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=RECEIVED(DATE(2020,1,1),DATE(2021,1,1),1000)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}
