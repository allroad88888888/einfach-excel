//! LET 的顺序绑定、嵌套与遮蔽。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

// === LET — L1 of the LAMBDA arc =====================================
//
// Excel 365's LET introduces lexical, sequential bindings into a
// single expression: `LET(name1, value1, ..., expr)`. The tests
// below cover the contract documented in the LET arm of
// `eval_func`.

#[test]
fn eval_let_simple() {
    let (cm, vs) = make_test_env();
    // Single binding, body uses the name twice.
    assert_eq!(eval_str("=LET(x, 5, x*x)", &cm, &vs), Value::Number(25.0));
}

#[test]
fn eval_let_sequential() {
    let (cm, vs) = make_test_env();
    // Second binding references the first — lexical/sequential.
    assert_eq!(
        eval_str("=LET(x, 5, y, x*2, x+y)", &cm, &vs),
        Value::Number(15.0)
    );
}

#[test]
fn eval_let_uses_cells() {
    let (cm, vs) = make_test_env();
    // A1 = 10 in make_test_env; t = 10 + 1 = 11; body = t*2 = 22.
    assert_eq!(
        eval_str("=LET(t, A1+1, t*2)", &cm, &vs),
        Value::Number(22.0)
    );
}

#[test]
fn eval_let_nested() {
    let (cm, vs) = make_test_env();
    // Inner LET sees outer `x` through the frame chain.
    assert_eq!(
        eval_str("=LET(x, 5, LET(y, x*2, x+y))", &cm, &vs),
        Value::Number(15.0)
    );
}

#[test]
fn eval_let_shadow() {
    let (cm, vs) = make_test_env();
    // Inner `x` shadows outer `x`: inner LET body is `x*2` where
    // x is 10 (the inner binding), so result is 20.
    assert_eq!(
        eval_str("=LET(x, 5, LET(x, 10, x*2))", &cm, &vs),
        Value::Number(20.0)
    );
}

#[test]
fn eval_let_wrong_arity_even() {
    let (cm, vs) = make_test_env();
    // 4 args = 1.5 pairs + 1 body — even total → WrongArgCount.
    assert_eq!(
        eval_str("=LET(x, 5, x*2, x*3)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_let_wrong_arity_one() {
    let (cm, vs) = make_test_env();
    // 1 arg = body alone, no bindings → WrongArgCount.
    assert_eq!(
        eval_str("=LET(5)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_let_bad_name() {
    let (cm, vs) = make_test_env();
    // 123 is parsed as Expr::Number, not Expr::Name → InvalidName.
    // (The body `x` would itself error too, but the name check
    // fires first since we walk bindings in order.)
    assert_eq!(
        eval_str("=LET(123, 5, x)", &cm, &vs),
        Value::Error(ValueError::InvalidName)
    );
}

#[test]
fn eval_let_error_in_value() {
    let (cm, vs) = make_test_env();
    // 1/0 in the value expression — error propagates out of LET.
    assert_eq!(
        eval_str("=LET(x, 1/0, x*2)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_name_unbound() {
    let (cm, vs) = make_test_env();
    // Bare `x` with no LET scope → #NAME?.
    assert_eq!(
        eval_str("=x", &cm, &vs),
        Value::Error(ValueError::InvalidName)
    );
}

#[test]
fn eval_let_inside_func_call() {
    let (cm, vs) = make_test_env();
    // LET binding visible to nested function call inside the body.
    // The thread-local scope guarantees SUM's arg eval still sees x.
    assert_eq!(
        eval_str("=LET(x, 5, SUM(x, x, x))", &cm, &vs),
        Value::Number(15.0)
    );
}

#[test]
fn eval_let_frame_stack_balanced_on_error() {
    let (cm, vs) = make_test_env();
    // After an error-propagating LET, the frame stack must pop.
    // A subsequent bare `x` outside any LET should still surface
    // #NAME?, not pick up a leaked binding.
    let _ = eval_str("=LET(x, 1/0, x)", &cm, &vs);
    assert_eq!(
        eval_str("=x", &cm, &vs),
        Value::Error(ValueError::InvalidName)
    );
}
