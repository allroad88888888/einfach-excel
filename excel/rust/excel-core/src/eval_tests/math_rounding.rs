//! ROUNDUP/ROUNDDOWN/MROUND 的定向舍入。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_roundup() {
    let (cm, vs) = make_test_env();
    // Away from zero on both signs.
    assert_eq!(eval_str("=ROUNDUP(3.2,0)", &cm, &vs), Value::Number(4.0));
    assert_eq!(eval_str("=ROUNDUP(-3.2,0)", &cm, &vs), Value::Number(-4.0));
    assert_eq!(
        eval_str("=ROUNDUP(3.14159,2)", &cm, &vs),
        Value::Number(3.15)
    );
    // Negative digits round to multiples of 10/100/...
    assert_eq!(eval_str("=ROUNDUP(123,-1)", &cm, &vs), Value::Number(130.0));
    assert_eq!(
        eval_str("=ROUNDUP(3.2)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=ROUNDUP(B2,0)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    assert_eq!(
        eval_str("=ROUNDUP(A1/C1,0)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_rounddown() {
    let (cm, vs) = make_test_env();
    // Toward zero on both signs.
    assert_eq!(eval_str("=ROUNDDOWN(3.7,0)", &cm, &vs), Value::Number(3.0));
    assert_eq!(
        eval_str("=ROUNDDOWN(-3.7,0)", &cm, &vs),
        Value::Number(-3.0)
    );
    assert_eq!(
        eval_str("=ROUNDDOWN(3.14159,2)", &cm, &vs),
        Value::Number(3.14)
    );
    assert_eq!(
        eval_str("=ROUNDDOWN(189,-1)", &cm, &vs),
        Value::Number(180.0)
    );
    assert_eq!(
        eval_str("=ROUNDDOWN(3.7)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=ROUNDDOWN(B2,0)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    assert_eq!(
        eval_str("=ROUNDDOWN(A1/C1,0)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_mround() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=MROUND(10,3)", &cm, &vs), Value::Number(9.0));
    // 1.3 / 0.2 hits binary-float imprecision; assert "close enough".
    match eval_str("=MROUND(1.3,0.2)", &cm, &vs) {
        Value::Number(n) => assert!((n - 1.4).abs() < 1e-9, "MROUND(1.3,0.2) = {}", n),
        other => panic!("expected number, got {:?}", other),
    }
    // multiple == 0 → 0.
    assert_eq!(eval_str("=MROUND(5,0)", &cm, &vs), Value::Number(0.0));
    // Sign mismatch → Overflow.
    assert_eq!(
        eval_str("=MROUND(5,-3)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
    assert_eq!(
        eval_str("=MROUND(-5,3)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
    // Both negative is fine, same sign.
    assert_eq!(eval_str("=MROUND(-10,-3)", &cm, &vs), Value::Number(-9.0));
    assert_eq!(
        eval_str("=MROUND(5)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=MROUND(B2,2)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    assert_eq!(
        eval_str("=MROUND(A1/C1,2)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}
