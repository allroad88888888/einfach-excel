//! BITAND/BITOR/BITXOR/BITLSHIFT/BITRSHIFT 的位运算。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_bitand() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=BITAND(15,9)", &cm, &vs), Value::Number(9.0));
    assert_eq!(eval_str("=BITAND(0,0)", &cm, &vs), Value::Number(0.0));
    // Arg count.
    assert_eq!(
        eval_str("=BITAND(1)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Negative → Overflow (#NUM!).
    assert_eq!(
        eval_str("=BITAND(-1,3)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
    // Fractional → Overflow.
    assert_eq!(
        eval_str("=BITAND(1.5,3)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
    // Text → WrongType.
    assert_eq!(
        eval_str("=BITAND(\"x\",3)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
}

#[test]
fn eval_bitor() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=BITOR(5,3)", &cm, &vs), Value::Number(7.0));
    assert_eq!(
        eval_str("=BITOR(-1,3)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_bitxor() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=BITXOR(5,3)", &cm, &vs), Value::Number(6.0));
    assert_eq!(eval_str("=BITXOR(255,170)", &cm, &vs), Value::Number(85.0));
}

#[test]
fn eval_bitlshift() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=BITLSHIFT(1,4)", &cm, &vs), Value::Number(16.0));
    assert_eq!(eval_str("=BITLSHIFT(8,-2)", &cm, &vs), Value::Number(2.0));
    // Beyond domain.
    assert_eq!(
        eval_str("=BITLSHIFT(1,54)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
    // Shift result outside 2^53-1 → Overflow.
    assert_eq!(
        eval_str("=BITLSHIFT(1,53)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_bitrshift() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=BITRSHIFT(16,4)", &cm, &vs), Value::Number(1.0));
    // Inverse of BITLSHIFT.
    assert_eq!(eval_str("=BITRSHIFT(2,-3)", &cm, &vs), Value::Number(16.0));
    assert_eq!(
        eval_str("=BITRSHIFT(1,-54)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
}
