//! UNICHAR/UNICODE/TRANSLATE 的码点级映射。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_unichar_happy() {
    assert_eq!(ev("=UNICHAR(65)"), Value::Text("A".into()));
    assert_eq!(ev("=UNICHAR(20013)"), Value::Text("中".into()));
    // Multi-byte emoji.
    assert_eq!(ev("=UNICHAR(128512)"), Value::Text("😀".into()));
}

#[test]
fn eval_unichar_surrogate_is_error() {
    assert_eq!(
        ev("=UNICHAR(55296)"),
        Value::Error(ValueError::InvalidValue)
    );
    assert_eq!(
        ev("=UNICHAR(57343)"),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn eval_unichar_out_of_range() {
    assert_eq!(ev("=UNICHAR(0)"), Value::Error(ValueError::InvalidValue));
    assert_eq!(
        ev("=UNICHAR(2000000)"),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn eval_unichar_arg_count() {
    assert_eq!(ev("=UNICHAR()"), Value::Error(ValueError::WrongArgCount));
    assert_eq!(ev("=UNICHAR(1,2)"), Value::Error(ValueError::WrongArgCount));
}

#[test]
fn eval_unichar_type_error() {
    assert_eq!(ev("=UNICHAR(\"abc\")"), Value::Error(ValueError::WrongType));
}

#[test]
fn eval_unicode_happy() {
    assert_eq!(ev("=UNICODE(\"A\")"), Value::Number(65.0));
    assert_eq!(ev("=UNICODE(\"ABC\")"), Value::Number(65.0));
    assert_eq!(ev("=UNICODE(\"中\")"), Value::Number(20013.0));
}

#[test]
fn eval_unicode_empty_is_error() {
    assert_eq!(ev("=UNICODE(\"\")"), Value::Error(ValueError::InvalidValue));
}

#[test]
fn eval_unicode_arg_count() {
    assert_eq!(ev("=UNICODE()"), Value::Error(ValueError::WrongArgCount));
}

// --- TRANSLATE ---

#[test]
fn translate_maps_codepoints() {
    assert_eq!(
        ev("=TRANSLATE(\"hello\", \"el\", \"ip\")"),
        Value::Text("hippo".into())
    );
    assert_eq!(
        ev("=TRANSLATE(\"hello\", \"l\", \"L\")"),
        Value::Text("heLLo".into())
    );
    assert_eq!(
        ev("=TRANSLATE(\"hello world\", \"lo\", \"L\")"),
        Value::Text("heLL wrLd".into())
    );
    assert_eq!(
        ev("=TRANSLATE(\"a😀b\", \"😀\", \"Z\")"),
        Value::Text("aZb".into())
    );
}

#[test]
fn translate_deletes_unpaired_find_codepoints() {
    assert_eq!(
        ev("=TRANSLATE(\"abcde\", \"bd\", \"X\")"),
        Value::Text("aXce".into())
    );
}

#[test]
fn translate_first_find_mapping_wins() {
    assert_eq!(
        ev("=TRANSLATE(\"aaa\", \"aa\", \"xy\")"),
        Value::Text("xxx".into())
    );
}

#[test]
fn translate_wrong_arg_count() {
    assert_eq!(
        ev("=TRANSLATE(\"hello\")"),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        ev("=TRANSLATE(\"a\", \"b\", \"c\", \"d\")"),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn translate_propagates_error() {
    // 1/0 inside an arg → error short-circuits before translation.
    assert_eq!(
        ev("=TRANSLATE(\"x\", 1/0, \"en\")"),
        Value::Error(ValueError::DivisionByZero)
    );
}
