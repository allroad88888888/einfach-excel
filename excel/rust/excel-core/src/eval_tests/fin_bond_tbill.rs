//! TBILLEQ/TBILLPRICE/TBILLYIELD 的国库券收益。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_tbilleq_happy_path() {
    let (cm, vs) = make_test_env();
    // TBILLEQ(DATE(2020,1,1), DATE(2020,7,1), 0.05): days=182
    // 365 * 0.05 / (360 - 0.05 * 182) = 18.25 / 350.9 ≈ 0.05201.
    match eval_str("=TBILLEQ(DATE(2020,1,1),DATE(2020,7,1),0.05)", &cm, &vs) {
        Value::Number(n) => assert!(approx(n, 0.05201, 1e-4), "TBILLEQ got {}", n),
        other => panic!("TBILLEQ: {:?}", other),
    }
}

#[test]
fn eval_tbilleq_invalid_discount() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=TBILLEQ(DATE(2020,1,1),DATE(2020,7,1),0)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_tbilleq_wrong_arg_count() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=TBILLEQ(DATE(2020,1,1),DATE(2020,7,1))", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_tbillprice_happy_path() {
    let (cm, vs) = make_test_env();
    // TBILLPRICE(DATE(2020,1,1), DATE(2020,7,1), 0.05): days=182
    // 100 * (1 - 0.05 * 182 / 360) = 100 - 2.5278 = 97.4722.
    match eval_str("=TBILLPRICE(DATE(2020,1,1),DATE(2020,7,1),0.05)", &cm, &vs) {
        Value::Number(n) => assert!(approx(n, 97.4722, 1e-3), "TBILLPRICE got {}", n),
        other => panic!("TBILLPRICE: {:?}", other),
    }
}

#[test]
fn eval_tbillprice_too_long() {
    let (cm, vs) = make_test_env();
    // diff > 365 → Overflow.
    assert_eq!(
        eval_str("=TBILLPRICE(DATE(2020,1,1),DATE(2022,1,1),0.05)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_tbillyield_happy_path() {
    let (cm, vs) = make_test_env();
    // TBILLYIELD(DATE(2020,1,1), DATE(2020,7,1), 97.4722): days=182
    // (100 - 97.4722) / 97.4722 * 360 / 182 ≈ 0.05130.
    match eval_str(
        "=TBILLYIELD(DATE(2020,1,1),DATE(2020,7,1),97.4722)",
        &cm,
        &vs,
    ) {
        Value::Number(n) => assert!(approx(n, 0.05130, 1e-4), "TBILLYIELD got {}", n),
        other => panic!("TBILLYIELD: {:?}", other),
    }
}

#[test]
fn eval_tbillyield_invalid_pr() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=TBILLYIELD(DATE(2020,1,1),DATE(2020,7,1),0)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
}
