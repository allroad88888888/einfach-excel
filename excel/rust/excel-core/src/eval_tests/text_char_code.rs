//! CHAR/CODE/CLEAN/PROPER 的字符编码与规范化。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_char() {
    let (cm, vs) = make_test_env();
    // ASCII.
    assert_eq!(eval_str("=CHAR(65)", &cm, &vs), Value::Text("A".into()));
    // Unicode round-trip: 20013 → "中".
    assert_eq!(eval_str("=CHAR(20013)", &cm, &vs), Value::Text("中".into()));
    // Truncation: 65.9 → 'A'.
    assert_eq!(eval_str("=CHAR(65.9)", &cm, &vs), Value::Text("A".into()));
    // Out of range low.
    assert_eq!(
        eval_str("=CHAR(0)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // Out of range high.
    assert_eq!(
        eval_str("=CHAR(2000000)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // Surrogate (invalid Unicode scalar): 0xD800 = 55296.
    assert_eq!(
        eval_str("=CHAR(55296)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // Wrong arg count.
    assert_eq!(
        eval_str("=CHAR(1,2)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Error propagation.
    assert_eq!(
        eval_str("=CHAR(A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_code() {
    let (cm, vs) = make_test_env();
    // ASCII.
    assert_eq!(eval_str("=CODE(\"A\")", &cm, &vs), Value::Number(65.0));
    // First char only.
    assert_eq!(eval_str("=CODE(\"ABC\")", &cm, &vs), Value::Number(65.0));
    // Unicode round-trip: "中" → 20013.
    assert_eq!(eval_str("=CODE(\"中\")", &cm, &vs), Value::Number(20013.0));
    // Empty text → InvalidValue.
    assert_eq!(
        eval_str("=CODE(\"\")", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // Wrong arg count.
    assert_eq!(
        eval_str("=CODE()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Error propagation.
    assert_eq!(
        eval_str("=CODE(A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_clean() {
    let (cm, vs) = make_test_env();
    // Strip embedded TAB (9) and BEL (7).
    assert_eq!(
        eval_str(
            "=CLEAN(CONCATENATE(\"a\",CHAR(9),\"b\",CHAR(7),\"c\"))",
            &cm,
            &vs
        ),
        Value::Text("abc".into())
    );
    // No-op on clean text.
    assert_eq!(
        eval_str("=CLEAN(\"hello\")", &cm, &vs),
        Value::Text("hello".into())
    );
    // Strip newline (10) and CR (13).
    assert_eq!(
        eval_str(
            "=CLEAN(CONCATENATE(\"x\",CHAR(10),CHAR(13),\"y\"))",
            &cm,
            &vs
        ),
        Value::Text("xy".into())
    );
    // Empty text edge.
    assert_eq!(eval_str("=CLEAN(\"\")", &cm, &vs), Value::Text("".into()));
    // Wrong arg count.
    assert_eq!(
        eval_str("=CLEAN(\"a\",\"b\")", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Error propagation.
    assert_eq!(
        eval_str("=CLEAN(A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_proper() {
    let (cm, vs) = make_test_env();
    // Basic two-word.
    assert_eq!(
        eval_str("=PROPER(\"hello world\")", &cm, &vs),
        Value::Text("Hello World".into())
    );
    // Apostrophe resets the word boundary.
    assert_eq!(
        eval_str("=PROPER(\"o'reilly\")", &cm, &vs),
        Value::Text("O'Reilly".into())
    );
    // Mixed case is normalized.
    assert_eq!(
        eval_str("=PROPER(\"HELLO wOrLd\")", &cm, &vs),
        Value::Text("Hello World".into())
    );
    // Numbers and punctuation pass through.
    assert_eq!(
        eval_str("=PROPER(\"abc 123 def\")", &cm, &vs),
        Value::Text("Abc 123 Def".into())
    );
    // Empty text edge.
    assert_eq!(eval_str("=PROPER(\"\")", &cm, &vs), Value::Text("".into()));
    // Wrong arg count.
    assert_eq!(
        eval_str("=PROPER(\"a\",\"b\")", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Error propagation.
    assert_eq!(
        eval_str("=PROPER(A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}
