//! PRICEDISC/YIELDDISC/PRICEMAT/YIELDMAT 的贴现票据定价。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_pricedisc_happy_path() {
    let (cm, vs) = make_test_env();
    // PRICEDISC: red * (1 - discount * yearfrac).
    // basis 0, settlement 2020-01-01, maturity 2020-07-01 → yf=0.5,
    // discount 0.05, red 100 → 100*(1 - 0.025) = 97.5.
    match eval_str(
        "=PRICEDISC(DATE(2020,1,1),DATE(2020,7,1),0.05,100,0)",
        &cm,
        &vs,
    ) {
        Value::Number(n) => assert!((n - 97.5).abs() < 1e-2, "PRICEDISC got {}", n),
        other => panic!("PRICEDISC: {:?}", other),
    }
}

#[test]
fn eval_pricedisc_wrong_arg_count() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=PRICEDISC(DATE(2020,1,1))", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_pricedisc_type_error() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=PRICEDISC(DATE(2020,1,1),DATE(2020,7,1),B2,100)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
}

#[test]
fn eval_pricedisc_settlement_after_maturity() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str(
            "=PRICEDISC(DATE(2020,7,1),DATE(2020,1,1),0.05,100)",
            &cm,
            &vs
        ),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_yielddisc_happy_path() {
    let (cm, vs) = make_test_env();
    // YIELDDISC: (red - pr)/pr/yf. 97.5 -> 100 over 0.5y = 0.05128205...
    match eval_str(
        "=YIELDDISC(DATE(2020,1,1),DATE(2020,7,1),97.5,100,0)",
        &cm,
        &vs,
    ) {
        Value::Number(n) => assert!(
            (n - (100.0 - 97.5) / 97.5 / 0.5).abs() < 1e-7,
            "YIELDDISC got {}",
            n
        ),
        other => panic!("YIELDDISC: {:?}", other),
    }
}

#[test]
fn eval_yielddisc_wrong_arg_count() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=YIELDDISC(DATE(2020,1,1))", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_yielddisc_negative_price() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=YIELDDISC(DATE(2020,1,1),DATE(2020,7,1),-1,100)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_pricemat_happy_path() {
    let (cm, vs) = make_test_env();
    // Issue 2019-01-01, settlement 2020-01-01, maturity 2021-01-01,
    // rate=0.05, yld=0.05. With basis=0: DIM=2.0, A=1.0, DSM=1.0.
    // price = (100 + 2*0.05*100)/(1 + 1*0.05) - 1*0.05*100
    //       = 110/1.05 - 5 ≈ 99.7619.
    match eval_str(
        "=PRICEMAT(DATE(2020,1,1),DATE(2021,1,1),DATE(2019,1,1),0.05,0.05,0)",
        &cm,
        &vs,
    ) {
        Value::Number(n) => assert!(
            (n - (110.0 / 1.05 - 5.0)).abs() < 1e-2,
            "PRICEMAT got {}",
            n
        ),
        other => panic!("PRICEMAT: {:?}", other),
    }
}

#[test]
fn eval_pricemat_wrong_arg_count() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=PRICEMAT()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_pricemat_type_error() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str(
            "=PRICEMAT(DATE(2020,1,1),DATE(2021,1,1),DATE(2019,1,1),B2,0.05)",
            &cm,
            &vs
        ),
        Value::Error(ValueError::WrongType)
    );
}

#[test]
fn eval_pricemat_issue_after_settlement() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str(
            "=PRICEMAT(DATE(2020,1,1),DATE(2021,1,1),DATE(2020,6,1),0.05,0.05)",
            &cm,
            &vs
        ),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_yieldmat_inverts_pricemat() {
    let (cm, vs) = make_test_env();
    // Round-trip with PRICEMAT.
    match eval_str(
        "=YIELDMAT(DATE(2020,1,1),DATE(2021,1,1),DATE(2019,1,1),0.05,PRICEMAT(DATE(2020,1,1),DATE(2021,1,1),DATE(2019,1,1),0.05,0.06,0),0)",
        &cm, &vs,
    ) {
        Value::Number(n) => assert!((n - 0.06).abs() < 1e-5, "YIELDMAT round-trip got {}", n),
        other => panic!("YIELDMAT round-trip: {:?}", other),
    }
}

#[test]
fn eval_yieldmat_wrong_arg_count() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=YIELDMAT()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_yieldmat_negative_price() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str(
            "=YIELDMAT(DATE(2020,1,1),DATE(2021,1,1),DATE(2019,1,1),0.05,-1)",
            &cm,
            &vs
        ),
        Value::Error(ValueError::Overflow)
    );
}
