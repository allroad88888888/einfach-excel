//! LAMBDA 字面量的参数校验、闭包与立即调用。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

// ── LAMBDA + immediate-call (Part A of L2) ───────────────────────

/// `=LAMBDA(x, x*x)(5)` is the canonical immediate-call sanity test
/// — defines a one-param lambda, applies it to 5, expects 25.
#[test]
fn eval_lambda_immediate_unary() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=LAMBDA(x, x*x)(5)", &cm, &vs),
        Value::Number(25.0)
    );
}

/// Multiple parameters in declaration order.
#[test]
fn eval_lambda_immediate_binary() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=LAMBDA(x, y, x+y)(3, 4)", &cm, &vs),
        Value::Number(7.0)
    );
}

/// Arity mismatch: too few args → WrongArgCount.
#[test]
fn eval_lambda_too_few_args() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=LAMBDA(x, x*x)()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

/// Arity mismatch: too many args → WrongArgCount.
#[test]
fn eval_lambda_too_many_args() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=LAMBDA(x, x*x)(1, 2)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

/// Nested LAMBDA producing a closure: `LAMBDA(x, LAMBDA(y, x*y))(3)`
/// returns a lambda that captures x=3; applying it to 4 yields 12.
#[test]
fn eval_lambda_closure_from_nested_lambda() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=LAMBDA(x, LAMBDA(y, x*y))(3)(4)", &cm, &vs),
        Value::Number(12.0)
    );
}

/// LAMBDA captures LET bindings visible at literal eval time.
/// `=LET(n, 7, LAMBDA(x, x*n)(3))` → 3*7 = 21.
#[test]
fn eval_lambda_captures_let_binding() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=LET(n, 7, LAMBDA(x, x*n)(3))", &cm, &vs),
        Value::Number(21.0)
    );
}

/// LAMBDA literal without immediate call returns Value::Lambda.
/// Sanity-check that the constructor produces the right variant.
#[test]
fn eval_lambda_literal_produces_lambda_value() {
    let (cm, vs) = make_test_env();
    let v = eval_str("=LAMBDA(x, x*x)", &cm, &vs);
    match v {
        Value::Lambda(arc) => {
            assert_eq!(arc.arity(), 1);
            assert_eq!(arc.param_names(), &["x".to_string()]);
        }
        _ => panic!("expected Value::Lambda, got {:?}", v),
    }
}

/// LAMBDA with no params and zero args still applies — the body
/// captures its surrounding scope and evaluates verbatim.
#[test]
fn eval_lambda_nullary_immediate_invocation() {
    let (cm, vs) = make_test_env();
    // Note: bare `=LAMBDA(42)` would be a 0-param lambda with body
    // = 42 since LAMBDA needs ≥ 1 arg (the body). Immediate-apply
    // returns 42.
    assert_eq!(eval_str("=LAMBDA(42)()", &cm, &vs), Value::Number(42.0));
}

/// Bad LAMBDA: < 2 args → WrongArgCount (just a body, no params is
/// OK at 1; 0 args is the only WrongArgCount path).
#[test]
fn eval_lambda_zero_args_is_error() {
    let (cm, vs) = make_test_env();
    // The parser will reject `=LAMBDA()` because parse_func_args
    // requires at least one expression between parens; check at the
    // formula level.
    let v = eval_str("=LAMBDA()", &cm, &vs);
    // Either WrongArgCount from eval (if it slips through) or a
    // parse failure caught earlier — both surface a kind of error
    // depending on the parse path. Right now `LAMBDA()` parses to
    // FuncCall { args: [] } and lands here with WrongArgCount.
    assert_eq!(v, Value::Error(ValueError::WrongArgCount));
}

/// Non-identifier in a param slot → InvalidName.
#[test]
fn eval_lambda_param_must_be_identifier() {
    let (cm, vs) = make_test_env();
    // `5` in the param slot is a number literal, not Expr::Name.
    assert_eq!(
        eval_str("=LAMBDA(5, 5)", &cm, &vs),
        Value::Error(ValueError::InvalidName)
    );
}

// ── ISOMITTED (Part B) ────────────────────────────────────────────

/// ISOMITTED currently returns FALSE for any argument — we don't
/// support optional LAMBDA parameters yet so the function is a stub.
/// Documented gap.
#[test]
fn eval_isomitted_returns_false() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=ISOMITTED(123)", &cm, &vs), Value::Boolean(false));
    assert_eq!(
        eval_str("=ISOMITTED(\"hi\")", &cm, &vs),
        Value::Boolean(false)
    );
}

/// LAMBDA stored in a LET binding, then passed to MAP — the lambda
/// flows through a name. This exercises the path "Name -> Value"
/// where the value is itself a Lambda.
#[test]
fn eval_lambda_named_via_let_then_mapped() {
    let (cm, vs) = make_test_env();
    let v = eval_str("=LET(sq, LAMBDA(x, x*x), MAP(SEQUENCE(4), sq))", &cm, &vs);
    match v {
        Value::Array(arr) => {
            assert_eq!(arr.shape(), (4, 1));
            let expected = [1.0, 4.0, 9.0, 16.0];
            for (i, e) in expected.iter().enumerate() {
                assert_eq!(arr.get(i as u32, 0), Some(&Value::Number(*e)));
            }
        }
        _ => panic!("expected Array, got {:?}", v),
    }
}
