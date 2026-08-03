//! TEXTJOIN/CONCAT/CONCATENATE 与 & 运算符的拼接。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_concat_string() {
    let (cm, vs) = make_test_env();
    // B2 = "text"; A1 = 10
    assert_eq!(eval_str("=B2&A1", &cm, &vs), Value::Text("text10".into()));
}

#[test]
fn eval_textjoin() {
    let (cm, vs) = make_test_env();
    // Basic join, ignore_empty=TRUE skips empty.
    assert_eq!(
        eval_str("=TEXTJOIN(\",\",TRUE,\"a\",\"\",\"b\",\"c\")", &cm, &vs),
        Value::Text("a,b,c".into())
    );
    // ignore_empty=FALSE keeps empty.
    assert_eq!(
        eval_str("=TEXTJOIN(\",\",FALSE,\"a\",\"\",\"b\")", &cm, &vs),
        Value::Text("a,,b".into())
    );
    // Numbers coerce; A1=10 B1=20.
    assert_eq!(
        eval_str("=TEXTJOIN(\"-\",TRUE,A1,B1)", &cm, &vs),
        Value::Text("10-20".into())
    );
    // Range arg streams: A1:B1 = 10,20.
    assert_eq!(
        eval_str("=TEXTJOIN(\":\",TRUE,A1:B1)", &cm, &vs),
        Value::Text("10:20".into())
    );
    // Empty text edge: delim="" and all empty inputs.
    assert_eq!(
        eval_str("=TEXTJOIN(\"\",TRUE,\"\",\"\")", &cm, &vs),
        Value::Text("".into())
    );
    // Wrong arg count: less than 3.
    assert_eq!(
        eval_str("=TEXTJOIN(\",\",TRUE)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // ignore_empty not coercible → WrongType.
    assert_eq!(
        eval_str("=TEXTJOIN(\",\",\"yes\",\"a\")", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    // Error propagation.
    assert_eq!(
        eval_str("=TEXTJOIN(\",\",TRUE,A1/C1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

// --- CONCAT ---

#[test]
fn concat_matches_concatenate() {
    assert_eq!(
        ev("=CONCAT(\"a\", \"b\", \"c\")"),
        ev("=CONCATENATE(\"a\", \"b\", \"c\")")
    );
}

#[test]
fn concat_accepts_ranges() {
    // CONCAT's distinguishing feature: takes ranges. We already
    // accept ranges in CONCATENATE through for_each_arg_value, so
    // both behave the same way here.
    let (cm, vs) = make_test_env();
    // A1=10, B1=20 → "1020".
    assert_eq!(
        eval_str("=CONCAT(A1:B1)", &cm, &vs),
        Value::Text("1020".into())
    );
}

#[test]
fn concat_propagates_error() {
    let (cm, vs) = make_test_env();
    // 1/0 inside a CONCAT arg → error propagates.
    assert_eq!(
        eval_str("=CONCAT(\"x\", 1/0)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}
