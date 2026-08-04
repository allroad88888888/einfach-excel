//! MDETERM/MMULT/MINVERSE/MUNIT/TRANSPOSE 的矩阵运算。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_mdeterm() {
    let (cm, vs) = make_math_env();
    // 2×2: det([[1,2],[3,4]]) = 1*4 - 2*3 = -2.
    assert_eq!(eval_str("=MDETERM(E1:F2)", &cm, &vs), Value::Number(-2.0),);
    // 3×3 identity → 1.
    match eval_str("=MDETERM(G1:I3)", &cm, &vs) {
        Value::Number(n) => assert!((n - 1.0).abs() < 1e-12, "det(I) = {n}"),
        other => panic!("expected number, got {other:?}"),
    }
    // Non-square → #VALUE!.
    assert_eq!(
        eval_str("=MDETERM(E1:G2)", &cm, &vs),
        Value::Error(ValueError::InvalidValue),
    );
    // Non-numeric cell → #TYPE! (D1 holds "text").
    assert_eq!(
        eval_str("=MDETERM(C1:D2)", &cm, &vs),
        Value::Error(ValueError::WrongType),
    );
    // Arg-count.
    assert_eq!(
        eval_str("=MDETERM()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount),
    );
}

#[test]
fn eval_mmult_2x2_correctness() {
    let (cm, vs) = make_math_env();
    // E1:F2 = [[1,2],[3,4]] (already populated by make_math_env).
    // Multiply by itself: [[7,10],[15,22]].
    match eval_str("=MMULT(E1:F2, E1:F2)", &cm, &vs) {
        Value::Array(arr) => {
            assert_eq!(arr.shape(), (2, 2));
            assert_eq!(arr.get(0, 0), Some(&Value::Number(7.0)));
            assert_eq!(arr.get(0, 1), Some(&Value::Number(10.0)));
            assert_eq!(arr.get(1, 0), Some(&Value::Number(15.0)));
            assert_eq!(arr.get(1, 1), Some(&Value::Number(22.0)));
        }
        other => panic!("expected 2x2 Array, got {:?}", other),
    }
}

#[test]
fn eval_mmult_dimension_mismatch() {
    let (cm, vs) = make_math_env();
    // 2×2 * 1×5 → inner mismatch (2 ≠ 1).
    assert_eq!(
        eval_str("=MMULT(E1:F2, B1:B5)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn eval_minverse_2x2_correctness() {
    let (cm, vs) = make_math_env();
    // [[1,2],[3,4]] → [[-2, 1], [1.5, -0.5]]
    match eval_str("=MINVERSE(E1:F2)", &cm, &vs) {
        Value::Array(arr) => {
            assert_eq!(arr.shape(), (2, 2));
            if let Some(Value::Number(n)) = arr.get(0, 0) {
                assert!((n - (-2.0)).abs() < 1e-9, "got {}", n);
            }
            if let Some(Value::Number(n)) = arr.get(1, 1) {
                assert!((n - (-0.5)).abs() < 1e-9, "got {}", n);
            }
        }
        other => panic!("expected 2x2 Array, got {:?}", other),
    }
}

#[test]
fn eval_munit_3_is_identity() {
    let (cm, vs) = make_math_env();
    match eval_str("=MUNIT(3)", &cm, &vs) {
        Value::Array(arr) => {
            assert_eq!(arr.shape(), (3, 3));
            for r in 0..3 {
                for c in 0..3 {
                    let expected = if r == c { 1.0 } else { 0.0 };
                    assert_eq!(arr.get(r, c), Some(&Value::Number(expected)));
                }
            }
        }
        other => panic!("expected 3x3 Array, got {:?}", other),
    }
}

#[test]
fn eval_munit_zero_is_value_error() {
    let (cm, vs) = make_math_env();
    assert_eq!(
        eval_str("=MUNIT(0)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn eval_transpose_2x2_swaps_off_diagonals() {
    let (cm, vs) = make_math_env();
    // E1:F2 = [[1,2],[3,4]] → transpose [[1,3],[2,4]].
    match eval_str("=TRANSPOSE(E1:F2)", &cm, &vs) {
        Value::Array(arr) => {
            assert_eq!(arr.shape(), (2, 2));
            assert_eq!(arr.get(0, 0), Some(&Value::Number(1.0)));
            assert_eq!(arr.get(0, 1), Some(&Value::Number(3.0)));
            assert_eq!(arr.get(1, 0), Some(&Value::Number(2.0)));
            assert_eq!(arr.get(1, 1), Some(&Value::Number(4.0)));
        }
        other => panic!("expected 2x2 Array, got {:?}", other),
    }
}

#[test]
fn eval_transpose_row_to_column() {
    let (cm, vs) = make_math_env();
    // A1:A5 (5 rows × 1 col) → transpose 1 × 5.
    match eval_str("=TRANSPOSE(A1:A5)", &cm, &vs) {
        Value::Array(arr) => {
            assert_eq!(arr.shape(), (1, 5));
            assert_eq!(arr.get(0, 4), Some(&Value::Number(5.0)));
        }
        other => panic!("expected 1x5 Array, got {:?}", other),
    }
}
