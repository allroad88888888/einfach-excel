//! SUMIFS 的多条件求和。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;
use super::criteria_env::*;

// ---- SUMIFS ----

#[test]
fn sumifs_single_pair_matches_sumif() {
    let (cm, vs) = make_multi_env();
    // SUMIFS(B, B, ">=30") → 30+40+50 = 120.
    assert_eq!(
        eval_str("=SUMIFS(B1:B5,B1:B5,\">=30\")", &cm, &vs),
        Value::Number(120.0)
    );
}

#[test]
fn sumifs_two_pairs_intersect() {
    let (cm, vs) = make_multi_env();
    // Sum B where color=red AND B>=30 → 30+40 = 70.
    assert_eq!(
        eval_str("=SUMIFS(B1:B5,C1:C5,\"red\",B1:B5,\">=30\")", &cm, &vs),
        Value::Number(70.0)
    );
}

#[test]
fn sumifs_wildcard() {
    let (cm, vs) = make_multi_env();
    // SUMIFS(B, A, "ap*") → 10+30+50 = 90 (apple, apricot, apple).
    assert_eq!(
        eval_str("=SUMIFS(B1:B5,A1:A5,\"ap*\")", &cm, &vs),
        Value::Number(90.0)
    );
}

#[test]
fn sumifs_wrong_arg_count() {
    let (cm, vs) = make_multi_env();
    assert_eq!(
        eval_str("=SUMIFS(B1:B5)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    // Even number of args after sum_range → invalid (each criterion needs
    // a paired range).
    assert_eq!(
        eval_str("=SUMIFS(B1:B5,A1:A5)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn sumifs_shape_mismatch() {
    let (cm, vs) = make_multi_env();
    assert_eq!(
        eval_str("=SUMIFS(B1:B5,A1:A3,\"apple\")", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn sumifs_empty_match_returns_zero() {
    let (cm, vs) = make_multi_env();
    assert_eq!(
        eval_str("=SUMIFS(B1:B5,A1:A5,\"zzz\")", &cm, &vs),
        Value::Number(0.0)
    );
}

#[test]
fn sumifs_skips_criteria_range_errors_but_not_sum_range_ones() {
    let mut cell_map = HashMap::new();
    let mut values = HashMap::new();
    let a1 = AtomId::from_raw(0);
    let b1 = AtomId::from_raw(1);
    cell_map.insert(CellAddress::new(0, 0), a1);
    cell_map.insert(CellAddress::new(0, 1), b1);
    values.insert(a1, Value::Error(ValueError::DivisionByZero));
    values.insert(b1, Value::Number(7.0));
    // 条件区错误 → 该行不命中，B1 根本没被读。
    assert_eq!(
        eval_str("=SUMIFS(B1:B1,A1:A1,\"x\")", &cell_map, &values),
        Value::Number(0.0)
    );
    // 对调两格：条件命中，求和区是错误 → 值档照旧传播。
    values.insert(a1, Value::Text("x".into()));
    values.insert(b1, Value::Error(ValueError::DivisionByZero));
    assert_eq!(
        eval_str("=SUMIFS(B1:B1,A1:A1,\"x\")", &cell_map, &values),
        Value::Error(ValueError::DivisionByZero)
    );
}
