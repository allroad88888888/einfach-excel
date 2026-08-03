//! EXACT/VALUE/T 的文本比较与类型转换。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_exact() {
    let (cm, vs) = make_test_env();
    // Equal case.
    assert_eq!(
        eval_str("=EXACT(\"abc\",\"abc\")", &cm, &vs),
        Value::Boolean(true)
    );
    // Case-sensitive: different.
    assert_eq!(
        eval_str("=EXACT(\"abc\",\"ABC\")", &cm, &vs),
        Value::Boolean(false)
    );
    // Number coercion: 10 -> "10" equals "10".
    assert_eq!(
        eval_str("=EXACT(A1,\"10\")", &cm, &vs),
        Value::Boolean(true)
    );
    // Empty-string edge.
    assert_eq!(
        eval_str("=EXACT(\"\",\"\")", &cm, &vs),
        Value::Boolean(true)
    );
    // Wrong arg count.
    assert_eq!(
        eval_str("=EXACT(\"a\")", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Error propagation.
    assert_eq!(
        eval_str("=EXACT(A1/C1,\"x\")", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_value() {
    let (cm, vs) = make_test_env();
    // Text with surrounding spaces parses.
    assert_eq!(
        eval_str("=VALUE(\"  42  \")", &cm, &vs),
        Value::Number(42.0)
    );
    // Number passes through.
    assert_eq!(eval_str("=VALUE(A1)", &cm, &vs), Value::Number(10.0));
    // Boolean.
    assert_eq!(eval_str("=VALUE(TRUE)", &cm, &vs), Value::Number(1.0));
    // Empty text → InvalidValue.
    assert_eq!(
        eval_str("=VALUE(\"\")", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // Unparseable → InvalidValue.
    assert_eq!(
        eval_str("=VALUE(\"abc\")", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // Wrong arg count.
    assert_eq!(
        eval_str("=VALUE(\"1\",\"2\")", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Error propagation.
    assert_eq!(
        eval_str("=VALUE(A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_t() {
    let (cm, vs) = make_test_env();
    // B2 = "text"
    assert_eq!(eval_str("=T(B2)", &cm, &vs), Value::Text("text".into()));
    // Number → empty text.
    assert_eq!(eval_str("=T(A1)", &cm, &vs), Value::Text("".into()));
    // Boolean → empty text.
    assert_eq!(eval_str("=T(TRUE)", &cm, &vs), Value::Text("".into()));
    // Empty text → empty text.
    assert_eq!(eval_str("=T(\"\")", &cm, &vs), Value::Text("".into()));
    // Wrong arg count.
    assert_eq!(
        eval_str("=T(\"a\",\"b\")", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Error propagation.
    assert_eq!(
        eval_str("=T(A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}
