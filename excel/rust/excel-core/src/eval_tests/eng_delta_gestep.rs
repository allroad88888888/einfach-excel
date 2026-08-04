//! DELTA/GESTEP 的阶跃比较。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_delta() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=DELTA(1,1)", &cm, &vs), Value::Number(1.0));
    assert_eq!(eval_str("=DELTA(1,2)", &cm, &vs), Value::Number(0.0));
    // Default second arg = 0.
    assert_eq!(eval_str("=DELTA(0)", &cm, &vs), Value::Number(1.0));
    assert_eq!(eval_str("=DELTA(5)", &cm, &vs), Value::Number(0.0));
    // Non-numeric → WrongType.
    assert_eq!(
        eval_str("=DELTA(\"x\",1)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
    // Arg count.
    assert_eq!(
        eval_str("=DELTA()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=DELTA(1,2,3)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_gestep() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=GESTEP(5,3)", &cm, &vs), Value::Number(1.0));
    assert_eq!(eval_str("=GESTEP(3,5)", &cm, &vs), Value::Number(0.0));
    assert_eq!(eval_str("=GESTEP(3,3)", &cm, &vs), Value::Number(1.0));
    // Default step = 0.
    assert_eq!(eval_str("=GESTEP(0)", &cm, &vs), Value::Number(1.0));
    assert_eq!(eval_str("=GESTEP(-1)", &cm, &vs), Value::Number(0.0));
    assert_eq!(
        eval_str("=GESTEP(\"x\",1)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
}
