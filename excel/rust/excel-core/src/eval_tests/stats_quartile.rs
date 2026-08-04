//! QUARTILE 的 INC/EXC 四分位数。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

// --- QUARTILE ---

#[test]
fn eval_quartile_basic() {
    let (cm, vs) = make_stat_env();
    // A1..A5 sorted = 2,4,6,8,10.
    // quart=0 → min = 2; quart=4 → max = 10; quart=2 → median = 6.
    assert_eq!(eval_str("=QUARTILE(A1:A5,0)", &cm, &vs), Value::Number(2.0));
    assert_eq!(
        eval_str("=QUARTILE(A1:A5,4)", &cm, &vs),
        Value::Number(10.0)
    );
    assert_eq!(eval_str("=QUARTILE(A1:A5,2)", &cm, &vs), Value::Number(6.0));
    // quart=2 should equal PERCENTILE(k=0.5).
    assert_eq!(
        eval_str("=QUARTILE(A1:A5,2)", &cm, &vs),
        eval_str("=PERCENTILE(A1:A5,0.5)", &cm, &vs),
    );
}

#[test]
fn eval_quartile_out_of_range() {
    let (cm, vs) = make_stat_env();
    assert_eq!(
        eval_str("=QUARTILE(A1:A5,5)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    assert_eq!(
        eval_str("=QUARTILE(A1:A5,-1)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
    // Fractional quart not allowed.
    assert_eq!(
        eval_str("=QUARTILE(A1:A5,1.5)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn eval_quartile_wrong_arg_count() {
    let (cm, vs) = make_stat_env();
    assert_eq!(
        eval_str("=QUARTILE(A1:A5)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_quartile_type_error() {
    let (cm, vs) = make_stat_env();
    assert_eq!(
        eval_str("=QUARTILE(A1:A5,\"x\")", &cm, &vs),
        Value::Error(ValueError::WrongType)
    );
}

#[test]
fn eval_quartile_inc_dotted() {
    let (cm, vs) = make_stat_env();
    // QUARTILE.INC mirrors QUARTILE (inclusive variant).
    assert_eq!(
        eval_str("=QUARTILE.INC(A1:A5,2)", &cm, &vs),
        Value::Number(6.0),
    );
    assert_eq!(
        eval_str("=QUARTILE.INC(A1:A5,2)", &cm, &vs),
        eval_str("=QUARTILE(A1:A5,2)", &cm, &vs),
    );
    assert_eq!(
        eval_str("=QUARTILE.INC(A1:A5)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount),
    );
}

#[test]
fn eval_quartile_exc() {
    let (cm, vs) = make_stat_env();
    // QUARTILE.EXC(A1:A5, 2) == PERCENTILE.EXC(0.5) = 6.
    assert_eq!(
        eval_str("=QUARTILE.EXC(A1:A5,2)", &cm, &vs),
        Value::Number(6.0),
    );
    // quart=1 → PERCENTILE.EXC(0.25) = 3.
    match eval_str("=QUARTILE.EXC(A1:A5,1)", &cm, &vs) {
        Value::Number(n) => assert!((n - 3.0).abs() < 1e-12, "got {n}"),
        other => panic!("QUARTILE.EXC(1): {other:?}"),
    }
    // quart=3 → PERCENTILE.EXC(0.75) = 9 (pos = 4.5 → interp 8/10).
    match eval_str("=QUARTILE.EXC(A1:A5,3)", &cm, &vs) {
        Value::Number(n) => assert!((n - 9.0).abs() < 1e-12, "got {n}"),
        other => panic!("QUARTILE.EXC(3): {other:?}"),
    }
    // 0 and 4 are NOT valid in exclusive mode.
    assert_eq!(
        eval_str("=QUARTILE.EXC(A1:A5,0)", &cm, &vs),
        Value::Error(ValueError::InvalidValue),
    );
    assert_eq!(
        eval_str("=QUARTILE.EXC(A1:A5,4)", &cm, &vs),
        Value::Error(ValueError::InvalidValue),
    );
    // Fractional quart rejected.
    assert_eq!(
        eval_str("=QUARTILE.EXC(A1:A5,1.5)", &cm, &vs),
        Value::Error(ValueError::InvalidValue),
    );
    // Arg-count error.
    assert_eq!(
        eval_str("=QUARTILE.EXC(A1:A5)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount),
    );
}

// --- QUARTILE / QUARTILE.INC ---

#[test]
fn quartile_inc_min_median_max() {
    let (cm, vs) = make_test_env();
    // [1,2,3,4,5] quart=0 → min=1, quart=2 → median=3, quart=4 → max=5.
    assert_eq!(
        eval_str("=QUARTILE.INC({1,2,3,4,5}, 0)", &cm, &vs),
        Value::Number(1.0)
    );
    assert_eq!(
        eval_str("=QUARTILE.INC({1,2,3,4,5}, 2)", &cm, &vs),
        Value::Number(3.0)
    );
    assert_eq!(
        eval_str("=QUARTILE.INC({1,2,3,4,5}, 4)", &cm, &vs),
        Value::Number(5.0)
    );
}

#[test]
fn quartile_alias_to_inc() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=QUARTILE({2,4,6,8,10}, 1)", &cm, &vs),
        eval_str("=QUARTILE.INC({2,4,6,8,10}, 1)", &cm, &vs)
    );
}

#[test]
fn quartile_inc_rejects_out_of_range() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=QUARTILE.INC({1,2,3}, 5)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}
