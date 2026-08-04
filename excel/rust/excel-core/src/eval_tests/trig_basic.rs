//! 正弦余弦正切及其反函数与角度弧度换算。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

// ---- B3: trig (radians) ----

#[test]
fn eval_sin() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=SIN(0)", &cm, &vs), Value::Number(0.0));
    match eval_str("=SIN(PI()/2)", &cm, &vs) {
        Value::Number(n) => assert!((n - 1.0).abs() < 1e-12, "SIN(PI/2)={}", n),
        other => panic!("expected number, got {:?}", other),
    }
    assert_eq!(
        eval_str("=SIN()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=SIN(B2)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    assert_eq!(
        eval_str("=SIN(A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_cos() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=COS(0)", &cm, &vs), Value::Number(1.0));
    match eval_str("=COS(PI())", &cm, &vs) {
        Value::Number(n) => assert!((n + 1.0).abs() < 1e-12, "COS(PI)={}", n),
        other => panic!("expected number, got {:?}", other),
    }
    assert_eq!(
        eval_str("=COS()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=COS(B2)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    assert_eq!(
        eval_str("=COS(A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_tan() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=TAN(0)", &cm, &vs), Value::Number(0.0));
    // Near PI/4 → ~1.
    match eval_str("=TAN(PI()/4)", &cm, &vs) {
        Value::Number(n) => assert!((n - 1.0).abs() < 1e-12, "TAN(PI/4)={}", n),
        other => panic!("expected number, got {:?}", other),
    }
    assert_eq!(
        eval_str("=TAN()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=TAN(B2)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    assert_eq!(
        eval_str("=TAN(A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_asin() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=ASIN(0)", &cm, &vs), Value::Number(0.0));
    match eval_str("=ASIN(1)", &cm, &vs) {
        Value::Number(n) => assert!(
            (n - std::f64::consts::FRAC_PI_2).abs() < 1e-12,
            "ASIN(1) = {}",
            n
        ),
        other => panic!("expected number, got {:?}", other),
    }
    // Out of domain.
    assert_eq!(
        eval_str("=ASIN(2)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
    assert_eq!(
        eval_str("=ASIN(-1.5)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
    assert_eq!(
        eval_str("=ASIN()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=ASIN(B2)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    assert_eq!(
        eval_str("=ASIN(A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_acos() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=ACOS(1)", &cm, &vs), Value::Number(0.0));
    match eval_str("=ACOS(0)", &cm, &vs) {
        Value::Number(n) => assert!(
            (n - std::f64::consts::FRAC_PI_2).abs() < 1e-12,
            "ACOS(0) = {}",
            n
        ),
        other => panic!("expected number, got {:?}", other),
    }
    assert_eq!(
        eval_str("=ACOS(2)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
    assert_eq!(
        eval_str("=ACOS(-1.5)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
    assert_eq!(
        eval_str("=ACOS()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=ACOS(B2)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    assert_eq!(
        eval_str("=ACOS(A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_atan() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=ATAN(0)", &cm, &vs), Value::Number(0.0));
    match eval_str("=ATAN(1)", &cm, &vs) {
        Value::Number(n) => assert!(
            (n - std::f64::consts::FRAC_PI_4).abs() < 1e-12,
            "ATAN(1) = {}",
            n
        ),
        other => panic!("expected number, got {:?}", other),
    }
    assert_eq!(
        eval_str("=ATAN()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=ATAN(B2)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    assert_eq!(
        eval_str("=ATAN(A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_atan2() {
    let (cm, vs) = make_test_env();
    // ATAN2(y, x) — y=1, x=1 → PI/4.
    match eval_str("=ATAN2(1,1)", &cm, &vs) {
        Value::Number(n) => assert!(
            (n - std::f64::consts::FRAC_PI_4).abs() < 1e-12,
            "ATAN2(1,1) = {}",
            n
        ),
        other => panic!("expected number, got {:?}", other),
    }
    // y=0, x=1 → 0.
    assert_eq!(eval_str("=ATAN2(0,1)", &cm, &vs), Value::Number(0.0));
    // y=1, x=0 → PI/2.
    match eval_str("=ATAN2(1,0)", &cm, &vs) {
        Value::Number(n) => assert!(
            (n - std::f64::consts::FRAC_PI_2).abs() < 1e-12,
            "ATAN2(1,0) = {}",
            n
        ),
        other => panic!("expected number, got {:?}", other),
    }
    assert_eq!(
        eval_str("=ATAN2(1)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=ATAN2(B2,1)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    assert_eq!(
        eval_str("=ATAN2(A1/C1,1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_radians() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=RADIANS(0)", &cm, &vs), Value::Number(0.0));
    match eval_str("=RADIANS(180)", &cm, &vs) {
        Value::Number(n) => assert!(
            (n - std::f64::consts::PI).abs() < 1e-12,
            "RADIANS(180) = {}",
            n
        ),
        other => panic!("expected number, got {:?}", other),
    }
    assert_eq!(
        eval_str("=RADIANS()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=RADIANS(B2)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    assert_eq!(
        eval_str("=RADIANS(A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_degrees() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=DEGREES(0)", &cm, &vs), Value::Number(0.0));
    match eval_str("=DEGREES(PI())", &cm, &vs) {
        Value::Number(n) => assert!((n - 180.0).abs() < 1e-12, "DEGREES(PI) = {}", n),
        other => panic!("expected number, got {:?}", other),
    }
    assert_eq!(
        eval_str("=DEGREES()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=DEGREES(B2)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    assert_eq!(
        eval_str("=DEGREES(A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}
