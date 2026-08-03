//! 反余割/反正割/反余切的定义域与主值。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_acsc() {
    let (cm, vs) = make_test_env();
    // ACSC(1) = asin(1) = PI/2.
    match eval_str("=ACSC(1)", &cm, &vs) {
        Value::Number(n) => assert!(
            (n - std::f64::consts::FRAC_PI_2).abs() < 1e-9,
            "ACSC(1) = {n}"
        ),
        other => panic!("expected number, got {:?}", other),
    }
    // ACSC(2) = asin(0.5) = PI/6.
    match eval_str("=ACSC(2)", &cm, &vs) {
        Value::Number(n) => assert!(
            (n - std::f64::consts::FRAC_PI_6).abs() < 1e-9,
            "ACSC(2) = {n}"
        ),
        other => panic!("expected number, got {:?}", other),
    }
    // n == 0 → #DIV/0!.
    assert_eq!(
        eval_str("=ACSC(0)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
    // |n| < 1 → out of domain.
    assert_eq!(
        eval_str("=ACSC(0.5)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
    assert_eq!(
        eval_str("=ACSC()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=ACSC(B2)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    assert_eq!(
        eval_str("=ACSC(A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_asec() {
    let (cm, vs) = make_test_env();
    // ASEC(1) = acos(1) = 0.
    assert_eq!(eval_str("=ASEC(1)", &cm, &vs), Value::Number(0.0));
    // ASEC(2) = acos(0.5) = PI/3.
    match eval_str("=ASEC(2)", &cm, &vs) {
        Value::Number(n) => assert!(
            (n - std::f64::consts::FRAC_PI_3).abs() < 1e-9,
            "ASEC(2) = {n}"
        ),
        other => panic!("expected number, got {:?}", other),
    }
    assert_eq!(
        eval_str("=ASEC(0)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
    assert_eq!(
        eval_str("=ASEC(0.5)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
    assert_eq!(
        eval_str("=ASEC()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=ASEC(B2)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    assert_eq!(
        eval_str("=ASEC(A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_acot() {
    let (cm, vs) = make_test_env();
    // ACOT(1) = PI/4.
    match eval_str("=ACOT(1)", &cm, &vs) {
        Value::Number(n) => assert!(
            (n - std::f64::consts::FRAC_PI_4).abs() < 1e-9,
            "ACOT(1) = {n}"
        ),
        other => panic!("expected number, got {:?}", other),
    }
    // ACOT(0) = PI/2 (Excel convention, defined for all real n).
    match eval_str("=ACOT(0)", &cm, &vs) {
        Value::Number(n) => assert!(
            (n - std::f64::consts::FRAC_PI_2).abs() < 1e-9,
            "ACOT(0) = {n}"
        ),
        other => panic!("expected number, got {:?}", other),
    }
    // ACOT(-1) = 3*PI/4 (Excel returns the (0, PI) branch).
    match eval_str("=ACOT(-1)", &cm, &vs) {
        Value::Number(n) => assert!(
            (n - 3.0 * std::f64::consts::FRAC_PI_4).abs() < 1e-9,
            "ACOT(-1) = {n}"
        ),
        other => panic!("expected number, got {:?}", other),
    }
    assert_eq!(
        eval_str("=ACOT()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=ACOT(B2)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    assert_eq!(
        eval_str("=ACOT(A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

// --- ACOTH ---

#[test]
fn acoth_happy_path() {
    // ACOTH(2) = 0.5 * ln(3) ≈ 0.549306
    assert_num_close("=ACOTH(2)", 0.5 * 3f64.ln(), 1e-9);
    // ACOTH(-2) = -ACOTH(2)
    assert_num_close("=ACOTH(-2)", -0.5 * 3f64.ln(), 1e-9);
}

#[test]
fn acoth_at_boundary_num_error() {
    // |x| == 1 → log(0)/log(inf) → #NUM!.
    assert_eq!(ev("=ACOTH(1)"), Value::Error(ValueError::Overflow));
    assert_eq!(ev("=ACOTH(-1)"), Value::Error(ValueError::Overflow));
}

#[test]
fn acoth_inside_domain_num_error() {
    // |x| < 1 → out of domain.
    assert_eq!(ev("=ACOTH(0.5)"), Value::Error(ValueError::Overflow));
    assert_eq!(ev("=ACOTH(0)"), Value::Error(ValueError::Overflow));
}

#[test]
fn acoth_wrong_arg_count() {
    assert_eq!(ev("=ACOTH()"), Value::Error(ValueError::WrongArgCount));
    assert_eq!(ev("=ACOTH(2, 3)"), Value::Error(ValueError::WrongArgCount));
}
