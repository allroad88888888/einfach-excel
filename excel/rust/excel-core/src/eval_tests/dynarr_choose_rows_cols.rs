//! CHOOSEROWS/CHOOSECOLS 的按索引抽取。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_chooserows_basic() {
    let (cm, vs) = make_test_env();
    // SEQUENCE(4) = [1,2,3,4]. CHOOSEROWS(1, 3) → [1, 3].
    let (r, c, data) = unwrap_array(eval_str("=CHOOSEROWS(SEQUENCE(4), 1, 3)", &cm, &vs));
    assert_eq!((r, c), (2, 1));
    assert_eq!(data, vec![Value::Number(1.0), Value::Number(3.0)]);
}

#[test]
fn eval_chooserows_negative_indices() {
    let (cm, vs) = make_test_env();
    // -1 = last row. SEQUENCE(4): last → 4.
    let (r, c, data) = unwrap_array(eval_str("=CHOOSEROWS(SEQUENCE(4), -1, 1)", &cm, &vs));
    assert_eq!((r, c), (2, 1));
    assert_eq!(data, vec![Value::Number(4.0), Value::Number(1.0)]);
}

#[test]
fn eval_chooserows_duplicates() {
    let (cm, vs) = make_test_env();
    // Duplicates allowed → CHOOSEROWS(SEQUENCE(3), 1, 1, 2) → [1, 1, 2].
    let (r, c, data) = unwrap_array(eval_str("=CHOOSEROWS(SEQUENCE(3), 1, 1, 2)", &cm, &vs));
    assert_eq!((r, c), (3, 1));
    assert_eq!(
        data,
        vec![Value::Number(1.0), Value::Number(1.0), Value::Number(2.0)]
    );
}

#[test]
fn eval_chooserows_zero_index_invalid() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=CHOOSEROWS(SEQUENCE(3), 0)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn eval_chooserows_out_of_range_invalid() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=CHOOSEROWS(SEQUENCE(3), 99)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn eval_chooserows_wrong_arg_count() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=CHOOSEROWS(SEQUENCE(3))", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_choosecols_basic() {
    let (cm, vs) = make_test_env();
    // SEQUENCE(2, 3) = [[1,2,3],[4,5,6]]. CHOOSECOLS(1, 3) → [[1,3],[4,6]].
    let (r, c, data) = unwrap_array(eval_str("=CHOOSECOLS(SEQUENCE(2, 3), 1, 3)", &cm, &vs));
    assert_eq!((r, c), (2, 2));
    assert_eq!(
        data,
        vec![
            Value::Number(1.0),
            Value::Number(3.0),
            Value::Number(4.0),
            Value::Number(6.0),
        ]
    );
}

#[test]
fn eval_choosecols_negative_indices() {
    let (cm, vs) = make_test_env();
    // -1 = last col. SEQUENCE(2,3) → CHOOSECOLS(-1, -2) → last & second-to-last.
    let (r, c, data) = unwrap_array(eval_str("=CHOOSECOLS(SEQUENCE(2, 3), -1, -2)", &cm, &vs));
    assert_eq!((r, c), (2, 2));
    assert_eq!(
        data,
        vec![
            Value::Number(3.0),
            Value::Number(2.0),
            Value::Number(6.0),
            Value::Number(5.0),
        ]
    );
}

#[test]
fn eval_choosecols_out_of_range_invalid() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=CHOOSECOLS(SEQUENCE(2, 3), 99)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}
