//! LOOKUP 的向量式与数组式查找。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

// === LOOKUP ===

/// LOOKUP vector form, 3-arg. Exact match returns the parallel
/// element.
#[test]
fn eval_lookup_vector_form_exact() {
    let (cm, vs) = make_test_env();
    // Keys: 1,2,3,4; Results: "a","b","c","d". LOOKUP(3,...) → "c".
    assert_eq!(
        eval_str("=LOOKUP(3, {1,2,3,4}, {\"a\",\"b\",\"c\",\"d\"})", &cm, &vs),
        Value::Text("c".into())
    );
}

/// LOOKUP picks the largest key ≤ needle (approximate walk).
#[test]
fn eval_lookup_vector_approximate() {
    let (cm, vs) = make_test_env();
    // Keys 1,3,5,7. needle=4 → largest ≤ is 3 → "b".
    assert_eq!(
        eval_str("=LOOKUP(4, {1,3,5,7}, {\"a\",\"b\",\"c\",\"d\"})", &cm, &vs),
        Value::Text("b".into())
    );
}

/// LOOKUP without `result_vector` returns the matching key itself.
#[test]
fn eval_lookup_two_arg_vector_form() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=LOOKUP(3, {1,2,3,4})", &cm, &vs),
        Value::Number(3.0)
    );
}

/// LOOKUP array form: 2nd arg is 2D, longer dimension carries the
/// lookup keys; the opposite end of the other dimension is the
/// result. Here {1,2;3,4} is 2×2 with cols == rows, so we treat as
/// horizontal (first row = keys, last row = result).
#[test]
fn eval_lookup_array_form() {
    let (cm, vs) = make_test_env();
    // 2×3 horizontal: keys 1,2,3 in row 0; results "a","b","c" in row 1.
    // LOOKUP(2, {1,2,3;"a","b","c"}) → "b".
    assert_eq!(
        eval_str("=LOOKUP(2, {1,2,3;\"a\",\"b\",\"c\"})", &cm, &vs),
        Value::Text("b".into())
    );
}

/// LOOKUP not found (needle smaller than every key) → #N/A.
#[test]
fn eval_lookup_not_found() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=LOOKUP(0, {1,2,3}, {\"a\",\"b\",\"c\"})", &cm, &vs),
        Value::Error(ValueError::NotAvailable)
    );
}

/// Vector lengths must agree.
#[test]
fn eval_lookup_shape_mismatch() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=LOOKUP(2, {1,2,3}, {\"a\",\"b\"})", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
}

#[test]
fn eval_lookup_arg_count_error() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=LOOKUP(1)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=LOOKUP(1,2,3,4)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}
