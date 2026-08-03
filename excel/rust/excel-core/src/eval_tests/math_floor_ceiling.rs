//! FLOOR/CEILING 各变体的向下向上取整。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_floor_math() {
    let (cm, vs) = make_math_env();
    // Default mode: FLOOR.MATH(-2.5) → -3 (toward -inf).
    assert_eq!(eval_str("=FLOOR.MATH(-2.5)", &cm, &vs), Value::Number(-3.0));
    // Mode != 0: -2.5 → -2 (toward zero).
    assert_eq!(
        eval_str("=FLOOR.MATH(-2.5,1,1)", &cm, &vs),
        Value::Number(-2.0),
    );
    // FLOOR.MATH diverges from FLOOR.PRECISE for negatives + mode!=0:
    // FLOOR.PRECISE always rounds toward -inf regardless of mode.
    assert_eq!(
        eval_str("=FLOOR.PRECISE(-2.5)", &cm, &vs),
        Value::Number(-3.0),
    );
    // Positive: same as floor.
    assert_eq!(eval_str("=FLOOR.MATH(10.5)", &cm, &vs), Value::Number(10.0));
    // Custom significance.
    assert_eq!(
        eval_str("=FLOOR.MATH(10.5,2)", &cm, &vs),
        Value::Number(10.0),
    );
    // sig=0 → 0.
    assert_eq!(
        eval_str("=FLOOR.MATH(10.5,0)", &cm, &vs),
        Value::Number(0.0)
    );
    // Type error.
    assert_eq!(
        eval_str("=FLOOR.MATH(D1)", &cm, &vs),
        Value::Error(ValueError::WrongType),
    );
    // Arg-count.
    assert_eq!(
        eval_str("=FLOOR.MATH()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount),
    );
    assert_eq!(
        eval_str("=FLOOR.MATH(1,2,3,4)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount),
    );
}

#[test]
fn eval_ceiling_math() {
    let (cm, vs) = make_math_env();
    // Default mode: CEILING.MATH(-2.5) → -2 (toward +inf).
    assert_eq!(
        eval_str("=CEILING.MATH(-2.5)", &cm, &vs),
        Value::Number(-2.0),
    );
    // Mode != 0: -2.5 → -3 (away from zero).
    assert_eq!(
        eval_str("=CEILING.MATH(-2.5,1,1)", &cm, &vs),
        Value::Number(-3.0),
    );
    // CEILING.PRECISE always toward +inf regardless of mode (= -2 here).
    assert_eq!(
        eval_str("=CEILING.PRECISE(-2.5)", &cm, &vs),
        Value::Number(-2.0),
    );
    // Positive.
    assert_eq!(
        eval_str("=CEILING.MATH(10.5)", &cm, &vs),
        Value::Number(11.0),
    );
    // sig=0 → 0.
    assert_eq!(
        eval_str("=CEILING.MATH(10.5,0)", &cm, &vs),
        Value::Number(0.0),
    );
    // Type error.
    assert_eq!(
        eval_str("=CEILING.MATH(D1)", &cm, &vs),
        Value::Error(ValueError::WrongType),
    );
    // Arg-count.
    assert_eq!(
        eval_str("=CEILING.MATH()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount),
    );
}

#[test]
fn eval_floor_precise() {
    let (cm, vs) = make_math_env();
    // Always toward -inf.
    assert_eq!(
        eval_str("=FLOOR.PRECISE(-2.5)", &cm, &vs),
        Value::Number(-3.0),
    );
    assert_eq!(
        eval_str("=FLOOR.PRECISE(10.5)", &cm, &vs),
        Value::Number(10.0),
    );
    // Negative significance treated as |sig|.
    assert_eq!(
        eval_str("=FLOOR.PRECISE(10.5,-2)", &cm, &vs),
        Value::Number(10.0),
    );
    // sig=0 → 0.
    assert_eq!(
        eval_str("=FLOOR.PRECISE(10.5,0)", &cm, &vs),
        Value::Number(0.0),
    );
    // Type error.
    assert_eq!(
        eval_str("=FLOOR.PRECISE(D1)", &cm, &vs),
        Value::Error(ValueError::WrongType),
    );
    // Arg-count.
    assert_eq!(
        eval_str("=FLOOR.PRECISE()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount),
    );
    assert_eq!(
        eval_str("=FLOOR.PRECISE(1,2,3)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount),
    );
}

#[test]
fn eval_ceiling_precise() {
    let (cm, vs) = make_math_env();
    // Always toward +inf.
    assert_eq!(
        eval_str("=CEILING.PRECISE(-2.5)", &cm, &vs),
        Value::Number(-2.0),
    );
    assert_eq!(
        eval_str("=CEILING.PRECISE(10.5)", &cm, &vs),
        Value::Number(11.0),
    );
    // Negative significance treated as |sig|.
    assert_eq!(
        eval_str("=CEILING.PRECISE(10.5,-2)", &cm, &vs),
        Value::Number(12.0),
    );
    // Type error.
    assert_eq!(
        eval_str("=CEILING.PRECISE(D1)", &cm, &vs),
        Value::Error(ValueError::WrongType),
    );
}
