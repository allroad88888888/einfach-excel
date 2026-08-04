//! SEQUENCE/RANDARRAY 按形状生成数组。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

// --- SEQUENCE ---

#[test]
fn eval_sequence_5() {
    let (cm, vs) = make_test_env();
    let (r, c, data) = unwrap_array(eval_str("=SEQUENCE(5)", &cm, &vs));
    assert_eq!((r, c), (5, 1));
    assert_eq!(
        data,
        vec![
            Value::Number(1.0),
            Value::Number(2.0),
            Value::Number(3.0),
            Value::Number(4.0),
            Value::Number(5.0),
        ]
    );
}

#[test]
fn eval_sequence_2_by_3() {
    let (cm, vs) = make_test_env();
    let (r, c, data) = unwrap_array(eval_str("=SEQUENCE(2,3)", &cm, &vs));
    assert_eq!((r, c), (2, 3));
    // Row-major: [1,2,3, 4,5,6].
    assert_eq!(
        data,
        vec![
            Value::Number(1.0),
            Value::Number(2.0),
            Value::Number(3.0),
            Value::Number(4.0),
            Value::Number(5.0),
            Value::Number(6.0),
        ]
    );
}

#[test]
fn eval_sequence_start_step() {
    let (cm, vs) = make_test_env();
    let (r, c, data) = unwrap_array(eval_str("=SEQUENCE(3, 1, 10, 2)", &cm, &vs));
    assert_eq!((r, c), (3, 1));
    assert_eq!(
        data,
        vec![
            Value::Number(10.0),
            Value::Number(12.0),
            Value::Number(14.0)
        ]
    );
}

#[test]
fn eval_sequence_zero_rows_invalid() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=SEQUENCE(0)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn eval_sequence_over_cap_invalid() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=SEQUENCE(2000000)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn eval_sequence_no_args_wrong_arg_count() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=SEQUENCE()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_randarray_default_shape() {
    let (cm, vs) = make_test_env();
    // RANDARRAY() → 1×1 array with one number in [0,1).
    let (r, c, data) = unwrap_array(eval_str("=RANDARRAY()", &cm, &vs));
    assert_eq!((r, c), (1, 1));
    match &data[0] {
        Value::Number(n) => {
            assert!(*n >= 0.0 && *n < 1.0, "expected [0,1), got {}", n);
        }
        other => panic!("expected Number, got {:?}", other),
    }
}

#[test]
fn eval_randarray_shape_and_bounds() {
    let (cm, vs) = make_test_env();
    // 2×3, range [10, 20] (continuous).
    let (r, c, data) = unwrap_array(eval_str("=RANDARRAY(2, 3, 10, 20)", &cm, &vs));
    assert_eq!((r, c), (2, 3));
    assert_eq!(data.len(), 6);
    for v in &data {
        match v {
            Value::Number(n) => {
                assert!(*n >= 10.0 && *n <= 20.0, "expected [10,20], got {}", n);
            }
            other => panic!("expected Number, got {:?}", other),
        }
    }
}

#[test]
fn eval_randarray_whole_number() {
    let (cm, vs) = make_test_env();
    // 1×5 whole numbers in [1, 6].
    let (r, c, data) = unwrap_array(eval_str("=RANDARRAY(1, 5, 1, 6, TRUE)", &cm, &vs));
    assert_eq!((r, c), (1, 5));
    for v in &data {
        match v {
            Value::Number(n) => {
                assert!(*n >= 1.0 && *n <= 6.0, "expected [1,6], got {}", n);
                assert_eq!(n.fract(), 0.0, "expected integer, got {}", n);
            }
            other => panic!("expected Number, got {:?}", other),
        }
    }
}

#[test]
fn eval_randarray_min_gt_max_invalid() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=RANDARRAY(1, 1, 10, 5)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn eval_randarray_whole_with_fractional_bounds_invalid() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=RANDARRAY(1, 1, 1.5, 5, TRUE)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn eval_randarray_wrong_arg_count() {
    let (cm, vs) = make_test_env();
    // 6 args: too many.
    assert_eq!(
        eval_str("=RANDARRAY(1, 1, 0, 1, FALSE, 99)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}
