//! FIND/SEARCH 在文本里定位子串。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

// === Batch B4: text expansion ===

#[test]
fn eval_find() {
    let (cm, vs) = make_test_env();
    // Case-sensitive: 'a' in "ABCabc" is at position 4 (1-based).
    assert_eq!(
        eval_str("=FIND(\"a\",\"ABCabc\")", &cm, &vs),
        Value::Number(4.0)
    );
    // With start_num beyond first occurrence.
    assert_eq!(
        eval_str("=FIND(\"o\",\"hello world\",6)", &cm, &vs),
        Value::Number(8.0)
    );
    // Not found.
    assert_eq!(
        eval_str("=FIND(\"z\",\"ABCabc\")", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // Empty needle returns start_num.
    assert_eq!(
        eval_str("=FIND(\"\",\"hello\")", &cm, &vs),
        Value::Number(1.0)
    );
    // Wrong arg count.
    assert_eq!(
        eval_str("=FIND(\"a\")", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Error propagation from arg.
    assert_eq!(
        eval_str("=FIND(\"a\",A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
    // start_num < 1.
    assert_eq!(
        eval_str("=FIND(\"a\",\"abc\",0)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn eval_search() {
    let (cm, vs) = make_test_env();
    // Case-insensitive: 'a' in "ABCabc" finds position 1.
    assert_eq!(
        eval_str("=SEARCH(\"a\",\"ABCabc\")", &cm, &vs),
        Value::Number(1.0)
    );
    // Explicitly contrast case sensitivity with FIND.
    assert_eq!(
        eval_str("=FIND(\"a\",\"ABCabc\")", &cm, &vs),
        Value::Number(4.0)
    );
    // start_num argument.
    assert_eq!(
        eval_str("=SEARCH(\"A\",\"ABCabc\",2)", &cm, &vs),
        Value::Number(4.0)
    );
    // Not found.
    assert_eq!(
        eval_str("=SEARCH(\"z\",\"ABCabc\")", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // Empty needle.
    assert_eq!(
        eval_str("=SEARCH(\"\",\"abc\")", &cm, &vs),
        Value::Number(1.0)
    );
    // Wrong arg count.
    assert_eq!(
        eval_str("=SEARCH(\"a\")", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Error propagation.
    assert_eq!(
        eval_str("=SEARCH(\"a\",A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}
