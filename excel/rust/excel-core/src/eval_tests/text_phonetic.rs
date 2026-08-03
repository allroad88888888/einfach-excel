//! PHONETIC 在缺少注音元数据时的降级行为。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_phonetic_returns_text_without_ruby_metadata() {
    let (cm, vs) = make_test_env();
    // We don't carry ruby annotation data, so PHONETIC degrades to
    // the source cell's text rendering.
    assert_eq!(
        eval_str("=PHONETIC(A1)", &cm, &vs),
        Value::Text("10".into())
    );
    assert_eq!(
        eval_str("=PHONETIC(\"かな\")", &cm, &vs),
        Value::Text("かな".into())
    );
    assert_eq!(
        eval_str("=PHONETIC(D4)", &cm, &vs),
        Value::Text(String::new())
    );
}

#[test]
fn eval_phonetic_range_uses_top_left() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=PHONETIC(A1:B1)", &cm, &vs),
        Value::Text("10".into())
    );
}

#[test]
fn eval_phonetic_range_ignores_non_top_left_error() {
    let (cm, mut vs) = make_test_env();
    let a1 = *cm.get(&CellAddress::new(0, 0)).unwrap();
    let b1 = *cm.get(&CellAddress::new(0, 1)).unwrap();
    vs.insert(a1, Value::Text("first".into()));
    vs.insert(b1, Value::Error(ValueError::InvalidRef));
    assert_eq!(
        eval_str("=PHONETIC(A1:B1)", &cm, &vs),
        Value::Text("first".into())
    );
}

#[test]
fn eval_phonetic_range_propagates_top_left_error() {
    let (cm, mut vs) = make_test_env();
    let a1 = *cm.get(&CellAddress::new(0, 0)).unwrap();
    vs.insert(a1, Value::Error(ValueError::InvalidRef));
    assert_eq!(
        eval_str("=PHONETIC(A1:B1)", &cm, &vs),
        Value::Error(ValueError::InvalidRef)
    );
}

#[test]
fn eval_phonetic_wrong_arg_count() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=PHONETIC()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_phonetic_error_propagates() {
    let (cm, vs) = make_test_env();
    // Even though the result is normally #VALUE!, an upstream error
    // still takes priority — keeps debugging sane.
    assert_eq!(
        eval_str("=PHONETIC(A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}
