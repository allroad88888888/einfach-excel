//! SUBSTITUTE/REPLACE/REPT 对文本的改写与重复。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_substitute() {
    let (cm, vs) = make_test_env();
    // Replace ALL occurrences.
    assert_eq!(
        eval_str("=SUBSTITUTE(\"banana\",\"a\",\"o\")", &cm, &vs),
        Value::Text("bonono".into())
    );
    // Replace single occurrence by instance_num.
    assert_eq!(
        eval_str("=SUBSTITUTE(\"banana\",\"a\",\"o\",2)", &cm, &vs),
        Value::Text("banona".into())
    );
    // instance_num beyond count → unchanged.
    assert_eq!(
        eval_str("=SUBSTITUTE(\"banana\",\"a\",\"o\",10)", &cm, &vs),
        Value::Text("banana".into())
    );
    // Empty old → unchanged.
    assert_eq!(
        eval_str("=SUBSTITUTE(\"abc\",\"\",\"x\")", &cm, &vs),
        Value::Text("abc".into())
    );
    // Empty text edge.
    assert_eq!(
        eval_str("=SUBSTITUTE(\"\",\"a\",\"b\")", &cm, &vs),
        Value::Text("".into())
    );
    // instance_num < 1.
    assert_eq!(
        eval_str("=SUBSTITUTE(\"a\",\"a\",\"b\",0)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // Wrong arg count.
    assert_eq!(
        eval_str("=SUBSTITUTE(\"a\",\"b\")", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Error propagation.
    assert_eq!(
        eval_str("=SUBSTITUTE(A1/C1,\"a\",\"b\")", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_replace() {
    let (cm, vs) = make_test_env();
    // Replace 3 chars starting at position 2 with "XYZ".
    assert_eq!(
        eval_str("=REPLACE(\"abcdef\",2,3,\"XYZ\")", &cm, &vs),
        Value::Text("aXYZef".into())
    );
    // num_chars 0 → insert.
    assert_eq!(
        eval_str("=REPLACE(\"abc\",2,0,\"--\")", &cm, &vs),
        Value::Text("a--bc".into())
    );
    // start past end → append.
    assert_eq!(
        eval_str("=REPLACE(\"abc\",10,5,\"XX\")", &cm, &vs),
        Value::Text("abcXX".into())
    );
    // Empty text edge.
    assert_eq!(
        eval_str("=REPLACE(\"\",1,0,\"hi\")", &cm, &vs),
        Value::Text("hi".into())
    );
    // start_num < 1.
    assert_eq!(
        eval_str("=REPLACE(\"abc\",0,1,\"x\")", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // num_chars < 0.
    assert_eq!(
        eval_str("=REPLACE(\"abc\",1,-1,\"x\")", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // Wrong arg count.
    assert_eq!(
        eval_str("=REPLACE(\"abc\",1,1)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Error propagation.
    assert_eq!(
        eval_str("=REPLACE(A1/C1,1,1,\"x\")", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_rept() {
    let (cm, vs) = make_test_env();
    // Happy path.
    assert_eq!(
        eval_str("=REPT(\"ab\",3)", &cm, &vs),
        Value::Text("ababab".into())
    );
    // n == 0 → empty.
    assert_eq!(
        eval_str("=REPT(\"abc\",0)", &cm, &vs),
        Value::Text("".into())
    );
    // n is truncated.
    assert_eq!(
        eval_str("=REPT(\"a\",3.9)", &cm, &vs),
        Value::Text("aaa".into())
    );
    // Empty text edge.
    assert_eq!(eval_str("=REPT(\"\",5)", &cm, &vs), Value::Text("".into()));
    // n < 0 → InvalidValue.
    assert_eq!(
        eval_str("=REPT(\"a\",-1)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // length limit: 1 char * 32768 > 32767.
    assert_eq!(
        eval_str("=REPT(\"a\",32768)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // length limit boundary: 1 char * 32767 is OK.
    match eval_str("=REPT(\"a\",32767)", &cm, &vs) {
        Value::Text(s) => assert_eq!(s.len(), 32767),
        other => panic!("expected Text, got {:?}", other),
    }
    // Wrong arg count.
    assert_eq!(
        eval_str("=REPT(\"a\")", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Error propagation.
    assert_eq!(
        eval_str("=REPT(A1/C1,1)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}
