//! VSTACK/HSTACK 的堆叠与不等形状补错。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_vstack_equal_shapes() {
    let (cm, vs) = make_test_env();
    // VSTACK(SEQUENCE(2), SEQUENCE(2, 1, 10)) → 4×1.
    let (r, c, data) = unwrap_array(eval_str(
        "=VSTACK(SEQUENCE(2), SEQUENCE(2, 1, 10))",
        &cm,
        &vs,
    ));
    assert_eq!((r, c), (4, 1));
    assert_eq!(
        data,
        vec![
            Value::Number(1.0),
            Value::Number(2.0),
            Value::Number(10.0),
            Value::Number(11.0),
        ]
    );
}

#[test]
fn eval_vstack_unequal_cols_pads_with_error() {
    let (cm, vs) = make_test_env();
    // VSTACK(SEQUENCE(1, 3), SEQUENCE(1, 1, 99)) → result cols = 3.
    // First block fills row 0: [1, 2, 3].
    // Second block's row 0 has only 1 col [99]; pad cols 1, 2 with #N/A.
    let (r, c, data) = unwrap_array(eval_str(
        "=VSTACK(SEQUENCE(1, 3), SEQUENCE(1, 1, 99))",
        &cm,
        &vs,
    ));
    assert_eq!((r, c), (2, 3));
    assert_eq!(
        data,
        vec![
            Value::Number(1.0),
            Value::Number(2.0),
            Value::Number(3.0),
            Value::Number(99.0),
            Value::Error(ValueError::NotAvailable),
            Value::Error(ValueError::NotAvailable),
        ]
    );
}

#[test]
fn eval_vstack_no_args() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=VSTACK()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_hstack_equal_shapes() {
    let (cm, vs) = make_test_env();
    // HSTACK(SEQUENCE(2,1), SEQUENCE(2,1,10)) → 2×2.
    let (r, c, data) = unwrap_array(eval_str(
        "=HSTACK(SEQUENCE(2, 1), SEQUENCE(2, 1, 10))",
        &cm,
        &vs,
    ));
    assert_eq!((r, c), (2, 2));
    assert_eq!(
        data,
        vec![
            Value::Number(1.0),
            Value::Number(10.0),
            Value::Number(2.0),
            Value::Number(11.0),
        ]
    );
}

#[test]
fn eval_hstack_unequal_rows_pads_with_error() {
    let (cm, vs) = make_test_env();
    // HSTACK(SEQUENCE(3,1), SEQUENCE(1,1,99)) → result rows = 3, cols = 2.
    // Row 0: [1, 99]. Row 1: [2, #N/A]. Row 2: [3, #N/A].
    let (r, c, data) = unwrap_array(eval_str(
        "=HSTACK(SEQUENCE(3, 1), SEQUENCE(1, 1, 99))",
        &cm,
        &vs,
    ));
    assert_eq!((r, c), (3, 2));
    assert_eq!(
        data,
        vec![
            Value::Number(1.0),
            Value::Number(99.0),
            Value::Number(2.0),
            Value::Error(ValueError::NotAvailable),
            Value::Number(3.0),
            Value::Error(ValueError::NotAvailable),
        ]
    );
}

#[test]
fn eval_hstack_no_args() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=HSTACK()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}
