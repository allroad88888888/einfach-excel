//! TAKE/DROP 的首尾行列裁剪。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_take_first_rows() {
    let (cm, vs) = make_test_env();
    // SEQUENCE(5, 2) is a 5×2 grid. TAKE 3 rows.
    let (r, c, data) = unwrap_array(eval_str("=TAKE(SEQUENCE(5, 2), 3)", &cm, &vs));
    assert_eq!((r, c), (3, 2));
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
fn eval_take_last_rows_negative() {
    let (cm, vs) = make_test_env();
    // SEQUENCE(5, 2): rows are 1..2, 3..4, 5..6, 7..8, 9..10. Last 2 rows.
    let (r, c, data) = unwrap_array(eval_str("=TAKE(SEQUENCE(5, 2), -2)", &cm, &vs));
    assert_eq!((r, c), (2, 2));
    assert_eq!(
        data,
        vec![
            Value::Number(7.0),
            Value::Number(8.0),
            Value::Number(9.0),
            Value::Number(10.0),
        ]
    );
}

#[test]
fn eval_take_rows_and_cols() {
    let (cm, vs) = make_test_env();
    // First 2 rows, last 1 col of SEQUENCE(3, 3).
    // SEQUENCE(3,3) = [[1,2,3],[4,5,6],[7,8,9]] → take 2 rows, -1 col → [[3],[6]].
    let (r, c, data) = unwrap_array(eval_str("=TAKE(SEQUENCE(3, 3), 2, -1)", &cm, &vs));
    assert_eq!((r, c), (2, 1));
    assert_eq!(data, vec![Value::Number(3.0), Value::Number(6.0)]);
}

#[test]
fn eval_take_over_caps() {
    let (cm, vs) = make_test_env();
    // Asking for more rows than exist caps at array's actual row count.
    let (r, c, data) = unwrap_array(eval_str("=TAKE(SEQUENCE(3), 99)", &cm, &vs));
    assert_eq!((r, c), (3, 1));
    assert_eq!(
        data,
        vec![Value::Number(1.0), Value::Number(2.0), Value::Number(3.0)]
    );
}

#[test]
fn eval_take_zero_rows_calc() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=TAKE(SEQUENCE(3), 0)", &cm, &vs),
        Value::Error(ValueError::Calc)
    );
}

#[test]
fn eval_take_wrong_arg_count() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=TAKE(SEQUENCE(3))", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_drop_first_rows() {
    let (cm, vs) = make_test_env();
    // SEQUENCE(5): [1,2,3,4,5]. DROP 2 → [3,4,5].
    let (r, c, data) = unwrap_array(eval_str("=DROP(SEQUENCE(5), 2)", &cm, &vs));
    assert_eq!((r, c), (3, 1));
    assert_eq!(
        data,
        vec![Value::Number(3.0), Value::Number(4.0), Value::Number(5.0)]
    );
}

#[test]
fn eval_drop_last_rows_negative() {
    let (cm, vs) = make_test_env();
    // DROP -2 = drop last 2 rows of SEQUENCE(5) → [1,2,3].
    let (r, c, data) = unwrap_array(eval_str("=DROP(SEQUENCE(5), -2)", &cm, &vs));
    assert_eq!((r, c), (3, 1));
    assert_eq!(
        data,
        vec![Value::Number(1.0), Value::Number(2.0), Value::Number(3.0)]
    );
}

#[test]
fn eval_drop_rows_and_cols() {
    let (cm, vs) = make_test_env();
    // SEQUENCE(3,3): drop 1 row from start and 1 col from start.
    // Original [[1,2,3],[4,5,6],[7,8,9]] → [[5,6],[8,9]].
    let (r, c, data) = unwrap_array(eval_str("=DROP(SEQUENCE(3, 3), 1, 1)", &cm, &vs));
    assert_eq!((r, c), (2, 2));
    assert_eq!(
        data,
        vec![
            Value::Number(5.0),
            Value::Number(6.0),
            Value::Number(8.0),
            Value::Number(9.0),
        ]
    );
}

#[test]
fn eval_drop_all_rows_calc() {
    let (cm, vs) = make_test_env();
    // Dropping all rows → empty → #CALC!.
    assert_eq!(
        eval_str("=DROP(SEQUENCE(3), 99)", &cm, &vs),
        Value::Error(ValueError::Calc)
    );
}
