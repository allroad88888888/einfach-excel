//! 花括号数组字面量的求值。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

// === Excel constant-array literal evaluation ===

/// `={1,2,3,4,5}` produces a 1×5 `Value::Array`.
#[test]
fn eval_array_literal_row() {
    let (cm, vs) = make_test_env();
    match eval_str("={1,2,3,4,5}", &cm, &vs) {
        Value::Array(arr) => {
            assert_eq!(arr.shape(), (1, 5));
            assert_eq!(arr.get(0, 0), Some(&Value::Number(1.0)));
            assert_eq!(arr.get(0, 4), Some(&Value::Number(5.0)));
        }
        other => panic!("expected Value::Array, got {:?}", other),
    }
}

/// `={1,2;3,4}` produces a row-major 2×2 array.
#[test]
fn eval_array_literal_2x2() {
    let (cm, vs) = make_test_env();
    match eval_str("={1,2;3,4}", &cm, &vs) {
        Value::Array(arr) => {
            assert_eq!(arr.shape(), (2, 2));
            assert_eq!(arr.get(0, 0), Some(&Value::Number(1.0)));
            assert_eq!(arr.get(0, 1), Some(&Value::Number(2.0)));
            assert_eq!(arr.get(1, 0), Some(&Value::Number(3.0)));
            assert_eq!(arr.get(1, 1), Some(&Value::Number(4.0)));
        }
        other => panic!("expected Value::Array, got {:?}", other),
    }
}

/// `=SUM({1,2,3,4,5})` flows through `for_each_arg_value`'s
/// `Value::Array` branch and sums to 15.
#[test]
fn eval_sum_of_array_literal() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=SUM({1,2,3,4,5})", &cm, &vs), Value::Number(15.0));
}

/// `={-1, 2}` — unary minus inside the literal evaluates to -1.
#[test]
fn eval_array_literal_negate() {
    let (cm, vs) = make_test_env();
    match eval_str("={-1, 2}", &cm, &vs) {
        Value::Array(arr) => {
            assert_eq!(arr.shape(), (1, 2));
            assert_eq!(arr.get(0, 0), Some(&Value::Number(-1.0)));
            assert_eq!(arr.get(0, 1), Some(&Value::Number(2.0)));
        }
        other => panic!("expected Value::Array, got {:?}", other),
    }
}

/// Error literals inside the array stay as per-cell error values.
#[test]
fn eval_array_literal_error_cell_is_preserved() {
    let (cm, vs) = make_test_env();
    match eval_str("={#N/A,#CALC!}", &cm, &vs) {
        Value::Array(arr) => {
            assert_eq!(arr.shape(), (1, 2));
            assert_eq!(arr.get(0, 0), Some(&Value::Error(ValueError::NotAvailable)));
            assert_eq!(arr.get(0, 1), Some(&Value::Error(ValueError::Calc)));
        }
        other => panic!("expected Value::Array, got {:?}", other),
    }
}
