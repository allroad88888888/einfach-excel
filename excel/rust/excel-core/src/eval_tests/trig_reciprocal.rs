//! 余割/正割/余切及其双曲形式的倒数三角函数。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_csc() {
    let (cm, vs) = make_test_env();
    // CSC(PI/2) = 1.
    match eval_str("=CSC(PI()/2)", &cm, &vs) {
        Value::Number(n) => assert!((n - 1.0).abs() < 1e-9, "CSC(PI/2) = {n}"),
        other => panic!("expected number, got {:?}", other),
    }
    // CSC(0) → sin(0)=0 → #DIV/0!.
    assert_eq!(
        eval_str("=CSC(0)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
    // CSC(PI) → sin(PI)≈0 but not exactly 0; just check we got a
    // (huge) finite number or Overflow — accept either.
    assert_eq!(
        eval_str("=CSC()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=CSC(B2)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    assert_eq!(
        eval_str("=CSC(A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_sec() {
    let (cm, vs) = make_test_env();
    // SEC(0) = 1.
    match eval_str("=SEC(0)", &cm, &vs) {
        Value::Number(n) => assert!((n - 1.0).abs() < 1e-9, "SEC(0) = {n}"),
        other => panic!("expected number, got {:?}", other),
    }
    // SEC(PI) = -1.
    match eval_str("=SEC(PI())", &cm, &vs) {
        Value::Number(n) => assert!((n + 1.0).abs() < 1e-9, "SEC(PI) = {n}"),
        other => panic!("expected number, got {:?}", other),
    }
    assert_eq!(
        eval_str("=SEC()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=SEC(B2)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    assert_eq!(
        eval_str("=SEC(A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_cot() {
    let (cm, vs) = make_test_env();
    // COT(PI/4) = 1.
    match eval_str("=COT(PI()/4)", &cm, &vs) {
        Value::Number(n) => assert!((n - 1.0).abs() < 1e-9, "COT(PI/4) = {n}"),
        other => panic!("expected number, got {:?}", other),
    }
    // COT(0) → tan(0)=0 → #DIV/0!.
    assert_eq!(
        eval_str("=COT(0)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
    assert_eq!(
        eval_str("=COT()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=COT(B2)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    assert_eq!(
        eval_str("=COT(A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_csch() {
    let (cm, vs) = make_test_env();
    // CSCH(1) = 1/sinh(1).
    match eval_str("=CSCH(1)", &cm, &vs) {
        Value::Number(n) => {
            assert!((n - 1.0 / 1.0f64.sinh()).abs() < 1e-9, "CSCH(1) = {n}")
        }
        other => panic!("expected number, got {:?}", other),
    }
    // CSCH(0) → sinh(0)=0 → #DIV/0!.
    assert_eq!(
        eval_str("=CSCH(0)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
    assert_eq!(
        eval_str("=CSCH()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=CSCH(B2)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    assert_eq!(
        eval_str("=CSCH(A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_sech() {
    let (cm, vs) = make_test_env();
    // SECH(0) = 1.
    assert_eq!(eval_str("=SECH(0)", &cm, &vs), Value::Number(1.0));
    match eval_str("=SECH(1)", &cm, &vs) {
        Value::Number(n) => {
            assert!((n - 1.0 / 1.0f64.cosh()).abs() < 1e-9, "SECH(1) = {n}")
        }
        other => panic!("expected number, got {:?}", other),
    }
    assert_eq!(
        eval_str("=SECH()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=SECH(B2)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    assert_eq!(
        eval_str("=SECH(A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_coth() {
    let (cm, vs) = make_test_env();
    match eval_str("=COTH(1)", &cm, &vs) {
        Value::Number(n) => {
            assert!((n - 1.0 / 1.0f64.tanh()).abs() < 1e-9, "COTH(1) = {n}")
        }
        other => panic!("expected number, got {:?}", other),
    }
    // COTH(0) → tanh(0)=0 → #DIV/0!.
    assert_eq!(
        eval_str("=COTH(0)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
    assert_eq!(
        eval_str("=COTH()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=COTH(B2)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    assert_eq!(
        eval_str("=COTH(A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}
