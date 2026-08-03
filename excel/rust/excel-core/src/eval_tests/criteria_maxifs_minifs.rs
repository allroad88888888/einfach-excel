//! MAXIFS/MINIFS 的多条件极值。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;
use super::criteria_env::*;

// ---- MAXIFS ----

#[test]
fn maxifs_happy_path() {
    let (cm, vs) = make_multi_env();
    // Max B where color=red → max(10, 30, 40) = 40.
    assert_eq!(
        eval_str("=MAXIFS(B1:B5,C1:C5,\"red\")", &cm, &vs),
        Value::Number(40.0)
    );
}

#[test]
fn maxifs_wildcard() {
    let (cm, vs) = make_multi_env();
    // Max B where name matches "ap*" → max(10, 30, 50) = 50.
    assert_eq!(
        eval_str("=MAXIFS(B1:B5,A1:A5,\"ap*\")", &cm, &vs),
        Value::Number(50.0)
    );
}

#[test]
fn maxifs_wrong_arg_count() {
    let (cm, vs) = make_multi_env();
    assert_eq!(
        eval_str("=MAXIFS(B1:B5)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=MAXIFS(B1:B5,A1:A5)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn maxifs_shape_mismatch() {
    let (cm, vs) = make_multi_env();
    assert_eq!(
        eval_str("=MAXIFS(B1:B5,A1:A3,\"apple\")", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn maxifs_empty_match_returns_zero() {
    let (cm, vs) = make_multi_env();
    // Per Excel: zero matches → 0.
    assert_eq!(
        eval_str("=MAXIFS(B1:B5,A1:A5,\"zzz\")", &cm, &vs),
        Value::Number(0.0)
    );
}

#[test]
fn maxifs_skips_criteria_range_errors_but_not_max_range_ones() {
    let mut cell_map = HashMap::new();
    let mut values = HashMap::new();
    let a1 = AtomId::from_raw(0);
    let b1 = AtomId::from_raw(1);
    cell_map.insert(CellAddress::new(0, 0), a1);
    cell_map.insert(CellAddress::new(0, 1), b1);
    values.insert(a1, Value::Error(ValueError::CyclicRef));
    values.insert(b1, Value::Number(7.0));
    // 条件区错误 → 不命中，无匹配行 → 0。
    assert_eq!(
        eval_str("=MAXIFS(B1:B1,A1:A1,\">0\")", &cell_map, &values),
        Value::Number(0.0)
    );
    // 对调：条件命中，值区是错误 → 传播。
    values.insert(a1, Value::Number(1.0));
    values.insert(b1, Value::Error(ValueError::CyclicRef));
    assert_eq!(
        eval_str("=MAXIFS(B1:B1,A1:A1,\">0\")", &cell_map, &values),
        Value::Error(ValueError::CyclicRef)
    );
}

// ---- MINIFS ----

#[test]
fn minifs_happy_path() {
    let (cm, vs) = make_multi_env();
    // Min B where color=red → min(10, 30, 40) = 10.
    assert_eq!(
        eval_str("=MINIFS(B1:B5,C1:C5,\"red\")", &cm, &vs),
        Value::Number(10.0)
    );
}

#[test]
fn minifs_wildcard() {
    let (cm, vs) = make_multi_env();
    // Min B where name matches "ap*" → min(10, 30, 50) = 10.
    assert_eq!(
        eval_str("=MINIFS(B1:B5,A1:A5,\"ap*\")", &cm, &vs),
        Value::Number(10.0)
    );
}

#[test]
fn minifs_wrong_arg_count() {
    let (cm, vs) = make_multi_env();
    assert_eq!(
        eval_str("=MINIFS(B1:B5)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn minifs_shape_mismatch() {
    let (cm, vs) = make_multi_env();
    assert_eq!(
        eval_str("=MINIFS(B1:B5,A1:A3,\"apple\")", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn minifs_empty_match_returns_zero() {
    let (cm, vs) = make_multi_env();
    assert_eq!(
        eval_str("=MINIFS(B1:B5,A1:A5,\"zzz\")", &cm, &vs),
        Value::Number(0.0)
    );
}

#[test]
fn minifs_skips_criteria_range_errors_but_not_min_range_ones() {
    let mut cell_map = HashMap::new();
    let mut values = HashMap::new();
    let a1 = AtomId::from_raw(0);
    let b1 = AtomId::from_raw(1);
    cell_map.insert(CellAddress::new(0, 0), a1);
    cell_map.insert(CellAddress::new(0, 1), b1);
    values.insert(a1, Value::Error(ValueError::Overflow));
    values.insert(b1, Value::Number(7.0));
    assert_eq!(
        eval_str("=MINIFS(B1:B1,A1:A1,\">0\")", &cell_map, &values),
        Value::Number(0.0)
    );
    values.insert(a1, Value::Number(1.0));
    values.insert(b1, Value::Error(ValueError::Overflow));
    assert_eq!(
        eval_str("=MINIFS(B1:B1,A1:A1,\">0\")", &cell_map, &values),
        Value::Error(ValueError::Overflow)
    );
}
