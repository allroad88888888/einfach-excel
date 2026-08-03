//! FACT/COMBIN/GCD/LCM/PERMUT 的组合计数。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_fact() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=FACT(0)", &cm, &vs), Value::Number(1.0));
    assert_eq!(eval_str("=FACT(1)", &cm, &vs), Value::Number(1.0));
    assert_eq!(eval_str("=FACT(5)", &cm, &vs), Value::Number(120.0));
    // Trunc the fractional part first.
    assert_eq!(eval_str("=FACT(5.9)", &cm, &vs), Value::Number(120.0));
    // Negative → Overflow.
    assert_eq!(
        eval_str("=FACT(-1)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
    // 171! overflows f64.
    assert_eq!(
        eval_str("=FACT(171)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
    assert_eq!(
        eval_str("=FACT()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=FACT(B2)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    assert_eq!(
        eval_str("=FACT(A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_combin() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=COMBIN(5,2)", &cm, &vs), Value::Number(10.0));
    assert_eq!(eval_str("=COMBIN(8,3)", &cm, &vs), Value::Number(56.0));
    assert_eq!(eval_str("=COMBIN(10,0)", &cm, &vs), Value::Number(1.0));
    assert_eq!(eval_str("=COMBIN(10,10)", &cm, &vs), Value::Number(1.0));
    // k > n is a domain error.
    assert_eq!(
        eval_str("=COMBIN(3,5)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
    // Negative inputs.
    assert_eq!(
        eval_str("=COMBIN(-1,1)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
    assert_eq!(
        eval_str("=COMBIN(5,-1)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
    assert_eq!(
        eval_str("=COMBIN(5)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=COMBIN(B2,2)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    assert_eq!(
        eval_str("=COMBIN(A1,A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_gcd() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=GCD(12,18)", &cm, &vs), Value::Number(6.0));
    assert_eq!(eval_str("=GCD(12,18,24)", &cm, &vs), Value::Number(6.0));
    assert_eq!(eval_str("=GCD(7,13)", &cm, &vs), Value::Number(1.0));
    assert_eq!(eval_str("=GCD(0,5)", &cm, &vs), Value::Number(5.0));
    // Range arg (A1=10, B1=20) and a scalar mix.
    assert_eq!(eval_str("=GCD(A1:B1)", &cm, &vs), Value::Number(10.0));
    assert_eq!(eval_str("=GCD(A1:B1,A2)", &cm, &vs), Value::Number(5.0));
    assert_eq!(
        eval_str("=GCD()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Negative argument → WrongType per spec.
    assert_eq!(
        eval_str("=GCD(-4,8)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    // Non-numeric.
    assert_eq!(
        eval_str("=GCD(B2,8)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    assert_eq!(
        eval_str("=GCD(A1,A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_lcm() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=LCM(4,6)", &cm, &vs), Value::Number(12.0));
    assert_eq!(eval_str("=LCM(2,3,5)", &cm, &vs), Value::Number(30.0));
    assert_eq!(eval_str("=LCM(0,5)", &cm, &vs), Value::Number(0.0));
    // Range arg + scalar (A1=10, B1=20) → lcm(10,20) = 20; with A2=5 → 20.
    assert_eq!(eval_str("=LCM(A1:B1)", &cm, &vs), Value::Number(20.0));
    assert_eq!(eval_str("=LCM(A1:B1,A2)", &cm, &vs), Value::Number(20.0));
    assert_eq!(
        eval_str("=LCM()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=LCM(-4,6)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    assert_eq!(
        eval_str("=LCM(B2,6)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    assert_eq!(
        eval_str("=LCM(A1,A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

// --- PERMUT ---

#[test]
fn permut_happy_path() {
    // P(5, 3) = 5*4*3 = 60.
    assert_eq!(ev("=PERMUT(5, 3)"), Value::Number(60.0));
    // P(n, 0) = 1.
    assert_eq!(ev("=PERMUT(10, 0)"), Value::Number(1.0));
    // P(n, n) = n!.
    assert_eq!(ev("=PERMUT(5, 5)"), Value::Number(120.0));
}

#[test]
fn permut_k_too_large() {
    assert_eq!(ev("=PERMUT(3, 5)"), Value::Error(ValueError::Overflow));
}

#[test]
fn permut_negative() {
    assert_eq!(ev("=PERMUT(-1, 3)"), Value::Error(ValueError::Overflow));
    assert_eq!(ev("=PERMUT(5, -1)"), Value::Error(ValueError::Overflow));
}

// --- PERMUTATIONA ---

#[test]
fn permutationa_happy_path() {
    // PA(n, k) = n^k.
    assert_eq!(ev("=PERMUTATIONA(3, 2)"), Value::Number(9.0));
    assert_eq!(ev("=PERMUTATIONA(5, 3)"), Value::Number(125.0));
}

#[test]
fn permutationa_zero_zero() {
    // 0^0 = 1 in Excel.
    assert_eq!(ev("=PERMUTATIONA(0, 0)"), Value::Number(1.0));
}

#[test]
fn permutationa_negative() {
    assert_eq!(
        ev("=PERMUTATIONA(-1, 2)"),
        Value::Error(ValueError::Overflow)
    );
}
