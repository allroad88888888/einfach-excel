//! 多区域引用 AREAS 的解析与拒绝。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

// === AREAS — multi-area reference counting ===

#[test]
fn areas_single_cell_ref_is_one() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=AREAS(A1)", &cm, &vs), Value::Number(1.0));
}

#[test]
fn areas_single_range_is_one() {
    let (cm, vs) = make_test_env();
    assert_eq!(eval_str("=AREAS(A1:B2)", &cm, &vs), Value::Number(1.0));
}

#[test]
fn areas_multi_area_two_parts() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=AREAS((A1:B2, D5:E6))", &cm, &vs),
        Value::Number(2.0)
    );
}

#[test]
fn areas_multi_area_three_parts() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=AREAS((A1:B2, D5:E6, F1))", &cm, &vs),
        Value::Number(3.0)
    );
}

#[test]
fn areas_no_args_wrong_arg_count() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=AREAS()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn areas_non_ref_arg_wrong_type() {
    let (cm, vs) = make_test_env();
    // `1+2` is a BinOp expression, not a reference. Excel surfaces
    // #VALUE!; we mirror that via WrongType.
    assert_eq!(
        eval_str("=AREAS(1+2)", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
}

#[test]
fn areas_too_many_args_wrong_arg_count() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=AREAS(A1, B1)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn sum_of_multi_area_is_value_error() {
    // SUM doesn't know how to walk a multi-area; the inner
    // `Expr::MultiArea` evaluates to #VALUE!, which propagates.
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=SUM((A1:B1, A2:B2))", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}
