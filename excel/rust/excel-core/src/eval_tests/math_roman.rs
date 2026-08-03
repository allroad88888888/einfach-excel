//! ROMAN/ARABIC/DECIMAL/BASE 的数字表示互转。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_roman() {
    let (cm, vs) = make_math_env();
    // Canonical round-trip value.
    assert_eq!(
        eval_str("=ROMAN(1994)", &cm, &vs),
        Value::Text("MCMXCIV".into()),
    );
    // Edge values.
    assert_eq!(eval_str("=ROMAN(1)", &cm, &vs), Value::Text("I".into()));
    assert_eq!(eval_str("=ROMAN(4)", &cm, &vs), Value::Text("IV".into()));
    assert_eq!(
        eval_str("=ROMAN(3999)", &cm, &vs),
        Value::Text("MMMCMXCIX".into())
    );
    // Out of range.
    assert_eq!(
        eval_str("=ROMAN(0)", &cm, &vs),
        Value::Error(ValueError::InvalidValue),
    );
    assert_eq!(
        eval_str("=ROMAN(4000)", &cm, &vs),
        Value::Error(ValueError::InvalidValue),
    );
    // Simplified forms and boolean aliases.
    assert_eq!(
        eval_str("=ROMAN(499,1)", &cm, &vs),
        Value::Text("LDVLIV".into()),
    );
    assert_eq!(
        eval_str("=ROMAN(499,2)", &cm, &vs),
        Value::Text("XDIX".into()),
    );
    assert_eq!(
        eval_str("=ROMAN(499,3)", &cm, &vs),
        Value::Text("VDIV".into()),
    );
    assert_eq!(
        eval_str("=ROMAN(499,4)", &cm, &vs),
        Value::Text("ID".into()),
    );
    assert_eq!(
        eval_str("=ROMAN(1999,TRUE)", &cm, &vs),
        Value::Text("MCMXCIX".into()),
    );
    assert_eq!(
        eval_str("=ROMAN(1999,FALSE)", &cm, &vs),
        Value::Text("MIM".into()),
    );
    // Type error.
    assert_eq!(
        eval_str("=ROMAN(D1)", &cm, &vs),
        Value::Error(ValueError::WrongType),
    );
    // Arg-count.
    assert_eq!(
        eval_str("=ROMAN()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount),
    );
}

#[test]
fn eval_arabic() {
    let (cm, vs) = make_math_env();
    // Round-trip with ROMAN.
    assert_eq!(
        eval_str("=ARABIC(\"MCMXCIV\")", &cm, &vs),
        Value::Number(1994.0),
    );
    // Lowercase / mixed.
    assert_eq!(
        eval_str("=ARABIC(\"mcmxciv\")", &cm, &vs),
        Value::Number(1994.0),
    );
    // Empty string → 0.
    assert_eq!(eval_str("=ARABIC(\"\")", &cm, &vs), Value::Number(0.0));
    // Invalid syntax → #VALUE!.
    assert_eq!(
        eval_str("=ARABIC(\"hello\")", &cm, &vs),
        Value::Error(ValueError::InvalidValue),
    );
    // Type: numbers are rejected.
    assert_eq!(
        eval_str("=ARABIC(123)", &cm, &vs),
        Value::Error(ValueError::WrongType),
    );
    // Arg-count.
    assert_eq!(
        eval_str("=ARABIC()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount),
    );
}

#[test]
fn eval_decimal() {
    let (cm, vs) = make_math_env();
    // DECIMAL("FF", 16) = 255.
    assert_eq!(
        eval_str("=DECIMAL(\"FF\",16)", &cm, &vs),
        Value::Number(255.0),
    );
    // Lowercase letters accepted.
    assert_eq!(
        eval_str("=DECIMAL(\"ff\",16)", &cm, &vs),
        Value::Number(255.0),
    );
    // Binary.
    assert_eq!(
        eval_str("=DECIMAL(\"1010\",2)", &cm, &vs),
        Value::Number(10.0),
    );
    // Invalid digit for base.
    assert_eq!(
        eval_str("=DECIMAL(\"12\",2)", &cm, &vs),
        Value::Error(ValueError::InvalidValue),
    );
    // Bad base.
    assert_eq!(
        eval_str("=DECIMAL(\"10\",1)", &cm, &vs),
        Value::Error(ValueError::InvalidValue),
    );
    assert_eq!(
        eval_str("=DECIMAL(\"10\",37)", &cm, &vs),
        Value::Error(ValueError::InvalidValue),
    );
    // Arg-count.
    assert_eq!(
        eval_str("=DECIMAL(\"FF\")", &cm, &vs),
        Value::Error(ValueError::WrongArgCount),
    );
}

#[test]
fn eval_base() {
    let (cm, vs) = make_math_env();
    // BASE(255, 16) = "FF".
    assert_eq!(
        eval_str("=BASE(255,16)", &cm, &vs),
        Value::Text("FF".into())
    );
    // Padded.
    assert_eq!(
        eval_str("=BASE(7,2,8)", &cm, &vs),
        Value::Text("00000111".into()),
    );
    // 0.
    assert_eq!(eval_str("=BASE(0,16)", &cm, &vs), Value::Text("0".into()));
    // Round-trip with DECIMAL: DECIMAL(BASE(255, 16), 16) == 255.
    assert_eq!(
        eval_str("=DECIMAL(BASE(255,16),16)", &cm, &vs),
        Value::Number(255.0),
    );
    // Negative input rejected.
    assert_eq!(
        eval_str("=BASE(-1,16)", &cm, &vs),
        Value::Error(ValueError::InvalidValue),
    );
    // Bad base.
    assert_eq!(
        eval_str("=BASE(10,1)", &cm, &vs),
        Value::Error(ValueError::InvalidValue),
    );
    // Arg-count.
    assert_eq!(
        eval_str("=BASE(10)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount),
    );
}
