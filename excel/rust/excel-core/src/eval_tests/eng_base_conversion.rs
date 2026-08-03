//! BIN2/OCT2/HEX2/DEC2 十二个进制转换内建。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_bin2dec() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=BIN2DEC(\"1010\")", &cm, &vs),
        Value::Number(10.0)
    );
    assert_eq!(
        eval_str("=BIN2DEC(\"1111111111\")", &cm, &vs),
        Value::Number(-1.0)
    );
    assert_eq!(eval_str("=BIN2DEC(1010)", &cm, &vs), Value::Number(10.0));
    // Invalid digit.
    assert_eq!(
        eval_str("=BIN2DEC(\"2\")", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // > 10 chars.
    assert_eq!(
        eval_str("=BIN2DEC(\"11111111110\")", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // Arg count.
    assert_eq!(
        eval_str("=BIN2DEC()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=BIN2DEC(\"1\",2)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Error propagation.
    assert_eq!(
        eval_str("=BIN2DEC(A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_oct2dec() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=OCT2DEC(\"17\")", &cm, &vs), Value::Number(15.0));
    assert_eq!(
        eval_str("=OCT2DEC(\"7777777777\")", &cm, &vs),
        Value::Number(-1.0)
    );
    assert_eq!(
        eval_str("=OCT2DEC(\"4000000000\")", &cm, &vs),
        Value::Number(-(1i64 << 29) as f64),
    );
    assert_eq!(
        eval_str("=OCT2DEC(\"8\")", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn eval_hex2dec() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=HEX2DEC(\"F\")", &cm, &vs), Value::Number(15.0));
    assert_eq!(eval_str("=HEX2DEC(\"ff\")", &cm, &vs), Value::Number(255.0));
    assert_eq!(
        eval_str("=HEX2DEC(\"FFFFFFFFFF\")", &cm, &vs),
        Value::Number(-1.0)
    );
    assert_eq!(
        eval_str("=HEX2DEC(\"G\")", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn eval_dec2bin() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=DEC2BIN(10)", &cm, &vs),
        Value::Text("1010".into())
    );
    assert_eq!(
        eval_str("=DEC2BIN(-1)", &cm, &vs),
        Value::Text("1111111111".into())
    );
    assert_eq!(
        eval_str("=DEC2BIN(-7)", &cm, &vs),
        Value::Text("1111111001".into())
    );
    // places padding.
    assert_eq!(
        eval_str("=DEC2BIN(5,8)", &cm, &vs),
        Value::Text("00000101".into())
    );
    // places ignored for negatives.
    assert_eq!(
        eval_str("=DEC2BIN(-1,4)", &cm, &vs),
        Value::Text("1111111111".into())
    );
    // places too small.
    assert_eq!(
        eval_str("=DEC2BIN(10,3)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // Out of range.
    assert_eq!(
        eval_str("=DEC2BIN(512)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
    assert_eq!(
        eval_str("=DEC2BIN(-513)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
    // Type / arg-count.
    assert_eq!(
        eval_str("=DEC2BIN()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=DEC2BIN(\"abc\")", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    // Negative round-trip.
    match eval_str("=BIN2DEC(DEC2BIN(-7))", &cm, &vs) {
        Value::Number(n) => assert_eq!(n, -7.0),
        other => panic!("round-trip: {other:?}"),
    }
}

#[test]
fn eval_dec2oct() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=DEC2OCT(15)", &cm, &vs), Value::Text("17".into()));
    assert_eq!(
        eval_str("=DEC2OCT(-1)", &cm, &vs),
        Value::Text("7777777777".into())
    );
    assert_eq!(
        eval_str("=DEC2OCT(8,4)", &cm, &vs),
        Value::Text("0010".into())
    );
    // Out of range: 2^29 = 536870912.
    assert_eq!(
        eval_str("=DEC2OCT(536870912)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_dec2hex() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=DEC2HEX(255)", &cm, &vs),
        Value::Text("FF".into())
    );
    assert_eq!(
        eval_str("=DEC2HEX(-1)", &cm, &vs),
        Value::Text("FFFFFFFFFF".into())
    );
    assert_eq!(
        eval_str("=DEC2HEX(255,4)", &cm, &vs),
        Value::Text("00FF".into())
    );
    // Out of range: 2^39 = 549755813888.
    assert_eq!(
        eval_str("=DEC2HEX(549755813888)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_bin2hex() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=BIN2HEX(\"1111\")", &cm, &vs),
        Value::Text("F".into())
    );
    // Negative: BIN2HEX("1111111111") = BIN2DEC(-1) → DEC2HEX(-1).
    assert_eq!(
        eval_str("=BIN2HEX(\"1111111111\")", &cm, &vs),
        Value::Text("FFFFFFFFFF".into())
    );
    // places padding on positive.
    assert_eq!(
        eval_str("=BIN2HEX(\"1010\",4)", &cm, &vs),
        Value::Text("000A".into())
    );
    // Invalid binary input propagates.
    assert_eq!(
        eval_str("=BIN2HEX(\"2\")", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn eval_bin2oct() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=BIN2OCT(\"1010\")", &cm, &vs),
        Value::Text("12".into())
    );
    assert_eq!(
        eval_str("=BIN2OCT(\"1111111111\")", &cm, &vs),
        Value::Text("7777777777".into())
    );
    assert_eq!(
        eval_str("=BIN2OCT(\"1010\",4)", &cm, &vs),
        Value::Text("0012".into())
    );
}

#[test]
fn eval_hex2bin() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=HEX2BIN(\"A\")", &cm, &vs),
        Value::Text("1010".into())
    );
    assert_eq!(
        eval_str("=HEX2BIN(\"FFFFFFFFFF\")", &cm, &vs),
        Value::Text("1111111111".into())
    );
    // Out of range (positive HEX larger than 511 → BIN can't fit).
    assert_eq!(
        eval_str("=HEX2BIN(\"FFF\")", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
    assert_eq!(
        eval_str("=HEX2BIN(\"A\",6)", &cm, &vs),
        Value::Text("001010".into())
    );
}

#[test]
fn eval_hex2oct() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=HEX2OCT(\"F\")", &cm, &vs),
        Value::Text("17".into())
    );
    assert_eq!(
        eval_str("=HEX2OCT(\"FFFFFFFFFF\")", &cm, &vs),
        Value::Text("7777777777".into())
    );
}

#[test]
fn eval_oct2bin() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=OCT2BIN(\"12\")", &cm, &vs),
        Value::Text("1010".into())
    );
    assert_eq!(
        eval_str("=OCT2BIN(\"7777777777\")", &cm, &vs),
        Value::Text("1111111111".into())
    );
    assert_eq!(
        eval_str("=OCT2BIN(\"1000\")", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_oct2hex() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=OCT2HEX(\"17\")", &cm, &vs),
        Value::Text("F".into())
    );
    assert_eq!(
        eval_str("=OCT2HEX(\"7777777777\")", &cm, &vs),
        Value::Text("FFFFFFFFFF".into())
    );
}
