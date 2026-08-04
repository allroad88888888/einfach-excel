//! IPMT/PPMT/ISPMT/CUMIPMT/CUMPRINC 的本息拆分。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_ipmt() {
    let (cm, vs) = make_test_env();
    // IPMT(0.005, 1, 360, 200000) ≈ -1000 (first-month interest on a
    // $200k 0.5%/mo loan is exactly 200000*0.005 = 1000, paid out).
    match eval_str("=IPMT(0.005,1,360,200000)", &cm, &vs) {
        Value::Number(n) => assert!(approx(n, -1000.0, 1e-2), "IPMT got {}", n),
        other => panic!("IPMT: {:?}", other),
    }
    // IPMT(0.005, 2, 360, 200000) ≈ -999.0045.
    match eval_str("=IPMT(0.005,2,360,200000)", &cm, &vs) {
        Value::Number(n) => assert!(approx(n, -999.0045, 1e-2), "IPMT(2) got {}", n),
        other => panic!("IPMT(2): {:?}", other),
    }
    // type=1, per=1 → 0 (no interest accrued yet).
    assert_eq!(
        eval_str("=IPMT(0.005,1,360,200000,0,1)", &cm, &vs),
        Value::Number(0.0)
    );
    // rate=0 → interest is 0 for every period.
    assert_eq!(eval_str("=IPMT(0,1,10,1000)", &cm, &vs), Value::Number(0.0));
    // per out of range → InvalidValue.
    assert_eq!(
        eval_str("=IPMT(0.005,0,360,200000)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    assert_eq!(
        eval_str("=IPMT(0.005,361,360,200000)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // Arg-count error.
    assert_eq!(
        eval_str("=IPMT(0.005,1,360)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Type error.
    assert_eq!(
        eval_str("=IPMT(B2,1,360,200000)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
}

#[test]
fn eval_ppmt() {
    let (cm, vs) = make_test_env();
    // PPMT(0.005, 1, 360, 200000) = PMT - IPMT
    // PMT ≈ -1199.10, IPMT ≈ -1000 → PPMT ≈ -199.10.
    match eval_str("=PPMT(0.005,1,360,200000)", &cm, &vs) {
        Value::Number(n) => assert!(approx(n, -199.10, 1e-2), "PPMT got {}", n),
        other => panic!("PPMT: {:?}", other),
    }
    // rate=0: every payment is purely principal, so PPMT = PMT = -100.
    assert_eq!(
        eval_str("=PPMT(0,1,10,1000)", &cm, &vs),
        Value::Number(-100.0)
    );
    // Arg-count error.
    assert_eq!(
        eval_str("=PPMT(0.005,1,360)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Type error.
    assert_eq!(
        eval_str("=PPMT(B2,1,360,200000)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    // per out of range error from IPMT path propagates.
    assert_eq!(
        eval_str("=PPMT(0.005,0,360,200000)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn eval_cumipmt_happy_path() {
    let (cm, vs) = make_test_env();
    // CUMIPMT(0.005, 360, 200000, 1, 12, 0) — sum of first-12-period
    // interest charges on a $200k 0.5%/mo loan. Closed-form expected
    // value ≈ -11933.19 (matches our IPMT(rate=0.005, per=k,...) summed
    // over k=1..12). Most spreadsheet implementations agree to within
    // a few cents depending on PMT rounding choices.
    match eval_str("=CUMIPMT(0.005,360,200000,1,12,0)", &cm, &vs) {
        Value::Number(n) => assert!(approx(n, -11933.19, 1e-1), "CUMIPMT got {}", n),
        other => panic!("CUMIPMT: {:?}", other),
    }
}

#[test]
fn eval_cumipmt_wrong_arg_count() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=CUMIPMT(0.005,360,200000,1,12)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_cumipmt_invalid_range() {
    let (cm, vs) = make_test_env();
    // start < 1 → Overflow.
    assert_eq!(
        eval_str("=CUMIPMT(0.005,360,200000,0,12,0)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
    // end > nper.
    assert_eq!(
        eval_str("=CUMIPMT(0.005,360,200000,1,361,0)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
    // end < start.
    assert_eq!(
        eval_str("=CUMIPMT(0.005,360,200000,12,1,0)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
    // negative rate.
    assert_eq!(
        eval_str("=CUMIPMT(-0.005,360,200000,1,12,0)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_cumipmt_type_error() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=CUMIPMT(B2,360,200000,1,12,0)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
}

#[test]
fn eval_cumprinc_happy_path() {
    let (cm, vs) = make_test_env();
    // CUMPRINC(0.005, 360, 200000, 1, 12, 0) — sum of first-12-period
    // principal payments. With PMT ≈ -1199.10/mo and our CUMIPMT ≈
    // -11933.19, the principal portion ≈ 12 * -1199.10 - (-11933.19)
    // ≈ -2456.02. (Excel/LibreOffice's PMT-rounding choices land
    // within a few cents of this.)
    match eval_str("=CUMPRINC(0.005,360,200000,1,12,0)", &cm, &vs) {
        Value::Number(n) => assert!(approx(n, -2456.02, 1e-1), "CUMPRINC got {}", n),
        other => panic!("CUMPRINC: {:?}", other),
    }
}

#[test]
fn eval_cumprinc_wrong_arg_count() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=CUMPRINC(0.005,360,200000)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_cumprinc_invalid_range() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=CUMPRINC(0.005,360,200000,0,12,0)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_ispmt_happy_path() {
    let (cm, vs) = make_test_env();
    // ISPMT(0.1, 1, 3, -1000) = -(-1000) * 0.1 * (1 - 1/3) = 100 * 2/3 ≈ 66.67.
    match eval_str("=ISPMT(0.1,1,3,-1000)", &cm, &vs) {
        Value::Number(n) => assert!(approx(n, 66.6667, 1e-3), "ISPMT got {}", n),
        other => panic!("ISPMT: {:?}", other),
    }
    // ISPMT at per=nper → 0.
    match eval_str("=ISPMT(0.1,3,3,-1000)", &cm, &vs) {
        Value::Number(n) => assert!(approx(n, 0.0, 1e-9), "ISPMT(per=nper) got {}", n),
        other => panic!("ISPMT(per=nper): {:?}", other),
    }
}

#[test]
fn eval_ispmt_zero_nper() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=ISPMT(0.1,1,0,-1000)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_ispmt_wrong_arg_count() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=ISPMT(0.1,1,3)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_ispmt_type_error() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=ISPMT(B2,1,3,-1000)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
}
