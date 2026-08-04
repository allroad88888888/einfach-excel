//! NUMBERVALUE/VALUETOTEXT/ARRAYTOTEXT 的值与文本互转。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_numbervalue_default_seps() {
    assert_eq!(ev("=NUMBERVALUE(\"1,234.56\")"), Value::Number(1234.56));
    assert_eq!(ev("=NUMBERVALUE(\"42\")"), Value::Number(42.0));
    assert_eq!(ev("=NUMBERVALUE(\"  3.14  \")"), Value::Number(3.14));
}

#[test]
fn eval_numbervalue_swapped_seps() {
    // European-style: `.` is the group sep, `,` is the decimal.
    assert_eq!(
        ev("=NUMBERVALUE(\"1.234,56\", \",\", \".\")"),
        Value::Number(1234.56)
    );
}

#[test]
fn eval_numbervalue_percent_scales() {
    assert_eq!(ev("=NUMBERVALUE(\"50%\")"), Value::Number(0.5));
    assert_eq!(ev("=NUMBERVALUE(\"100%%\")"), Value::Number(0.01));
}

#[test]
fn eval_numbervalue_parse_fail() {
    assert_eq!(
        ev("=NUMBERVALUE(\"hello\")"),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn eval_numbervalue_arg_count() {
    assert_eq!(
        ev("=NUMBERVALUE()"),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        ev("=NUMBERVALUE(\"1\",\".\",\",\",\"x\")"),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_numbervalue_same_separators_is_error() {
    assert_eq!(
        ev("=NUMBERVALUE(\"1.2\", \".\", \".\")"),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn eval_valuetotext_concise() {
    assert_eq!(ev("=VALUETOTEXT(\"abc\")"), Value::Text("abc".into()));
    assert_eq!(ev("=VALUETOTEXT(42)"), Value::Text("42".into()));
    assert_eq!(ev("=VALUETOTEXT(TRUE)"), Value::Text("TRUE".into()));
}

#[test]
fn eval_valuetotext_strict_quotes_text() {
    assert_eq!(
        ev("=VALUETOTEXT(\"abc\", 1)"),
        Value::Text("\"abc\"".into())
    );
    // Embedded `"` doubling is exercised at the helper level rather than
    // via the formula parser (the formula parser doesn't yet decode the
    // Excel `""` escape, so we build the input directly).
    let q = quote_strict_text("a\"b");
    assert_eq!(q, "\"a\"\"b\"");
    // Numbers stay un-quoted even in strict mode.
    assert_eq!(ev("=VALUETOTEXT(7, 1)"), Value::Text("7".into()));
}

#[test]
fn eval_valuetotext_arg_count() {
    assert_eq!(
        ev("=VALUETOTEXT()"),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        ev("=VALUETOTEXT(1,2,3)"),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_arraytotext_2x2_concise() {
    let (cm, vs) = make_test_env();
    // A1=10, B1=20, A2=5, B2="text". Concise → "10,20;5,text".
    assert_eq!(
        eval_str("=ARRAYTOTEXT(A1:B2)", &cm, &vs),
        Value::Text("10,20;5,text".into())
    );
}

#[test]
fn eval_arraytotext_2x2_strict() {
    let (cm, vs) = make_test_env();
    // Strict → `{10,20;5,"text"}`.
    assert_eq!(
        eval_str("=ARRAYTOTEXT(A1:B2, 1)", &cm, &vs),
        Value::Text("{10,20;5,\"text\"}".into())
    );
}

#[test]
fn eval_arraytotext_scalar_strict_braced() {
    assert_eq!(ev("=ARRAYTOTEXT(\"x\", 1)"), Value::Text("{\"x\"}".into()));
}

#[test]
fn eval_arraytotext_arg_count() {
    assert_eq!(
        ev("=ARRAYTOTEXT()"),
        Value::Error(ValueError::WrongArgCount)
    );
}
