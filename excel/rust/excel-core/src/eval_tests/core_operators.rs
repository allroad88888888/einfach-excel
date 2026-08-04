//! 字面量、单元格引用与算术比较运算符的求值。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_number_literal() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=42", &cm, &vs), Value::Number(42.0));
}

#[test]
fn eval_cell_ref() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=A1", &cm, &vs), Value::Number(10.0));
}

#[test]
fn eval_absolute_refs_are_identical_to_relative() {
    // Requirement #1 / static-parity: absoluteness NEVER changes a value.
    // The static TS backend strips `$` before evaluating; this engine
    // keeps `$` but must produce the SAME value — proven here by equality
    // against the relative twin (`static(strip $)` == `engine(relative)`).
    let (cm, vs) = make_test_env();
    for (abs, rel) in [
        ("=$A$1", "=A1"),
        ("=$A1", "=A1"),
        ("=A$1", "=A1"),
        ("=$A$1+$B$1", "=A1+B1"),
        ("=SUM($A$1:$B$1)", "=SUM(A1:B1)"),
        ("=SUM($A$1:$B1)", "=SUM(A1:B1)"),
    ] {
        assert_eq!(
            eval_str(abs, &cm, &vs),
            eval_str(rel, &cm, &vs),
            "{abs} must evaluate identically to {rel}"
        );
    }
    // Concrete value anchor so the equality above can't pass vacuously.
    assert_eq!(eval_str("=$A$1+$B$1", &cm, &vs), Value::Number(30.0));
}

#[test]
fn eval_addition() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=A1+B1", &cm, &vs), Value::Number(30.0));
}

#[test]
fn eval_complex_expr() {
    let (cm, vs) = make_test_env();
    // (A1+B1)*2 = 60
    assert_eq!(eval_str("=(A1+B1)*2", &cm, &vs), Value::Number(60.0));
}

#[test]
fn eval_division_by_zero() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=A1/C1", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_negation() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=-A1", &cm, &vs), Value::Number(-10.0));
}

#[test]
fn eval_text_arithmetic_is_error() {
    let (cm, vs) = make_test_env();
    // B2 holds a text value; adding 1 to it cannot coerce → `#VALUE!`,
    // which is what Excel reports for `=1+"x"`. It must NOT be the
    // engine-private `#TYPE!`: that code has no Excel counterpart, so
    // emitting it here broke cross-engine parity.
    assert_eq!(
        eval_str("=B2+1", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

// === Phase 2 tests ===

#[test]
fn eval_pow() {
    let (cm, vs) = make_test_env();
    // 2^3 = 8
    assert_eq!(eval_str("=2^3", &cm, &vs), Value::Number(8.0));
    // right-associative: 2^3^2 = 2^(3^2) = 2^9 = 512
    assert_eq!(eval_str("=2^3^2", &cm, &vs), Value::Number(512.0));
}

#[test]
fn eval_comparison_returns_boolean() {
    let (cm, vs) = make_test_env();
    // A1=10, B1=20
    assert_eq!(eval_str("=A1<B1", &cm, &vs), Value::Boolean(true));
    assert_eq!(eval_str("=A1>B1", &cm, &vs), Value::Boolean(false));
    assert_eq!(eval_str("=A1=10", &cm, &vs), Value::Boolean(true));
    assert_eq!(eval_str("=A1<>10", &cm, &vs), Value::Boolean(false));
    assert_eq!(eval_str("=A1<=10", &cm, &vs), Value::Boolean(true));
    assert_eq!(eval_str("=A1>=10", &cm, &vs), Value::Boolean(true));
}

#[test]
fn eval_unknown_func() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=FOO(A1)", &cm, &vs),
        Value::Error(ValueError::InvalidName)
    );
}

#[test]
fn eval_null_coerces_to_zero() {
    let (cm, vs) = make_test_env();
    // D1 doesn't exist → Null → 0
    assert_eq!(eval_str("=D1+5", &cm, &vs), Value::Number(5.0));
}
