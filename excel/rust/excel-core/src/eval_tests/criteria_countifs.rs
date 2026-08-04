//! COUNTIFS 的多条件计数。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;
use super::criteria_env::*;

// ---- COUNTIFS ----

#[test]
fn countifs_single_pair_matches_countif() {
    let (cm, vs) = make_multi_env();
    // Same as COUNTIF(B1:B5, ">=30") → 3.
    assert_eq!(
        eval_str("=COUNTIFS(B1:B5,\">=30\")", &cm, &vs),
        Value::Number(3.0)
    );
}

#[test]
fn countifs_two_pairs_intersect() {
    let (cm, vs) = make_multi_env();
    // Color=red AND amount>=30: rows 3 (apricot/30) and 4 (cherry/40) → 2.
    assert_eq!(
        eval_str("=COUNTIFS(C1:C5,\"red\",B1:B5,\">=30\")", &cm, &vs),
        Value::Number(2.0)
    );
}

#[test]
fn countifs_wildcard_star() {
    let (cm, vs) = make_multi_env();
    // Names starting with "ap*": "apple", "apricot", "apple" → 3.
    assert_eq!(
        eval_str("=COUNTIFS(A1:A5,\"ap*\")", &cm, &vs),
        Value::Number(3.0)
    );
}

#[test]
fn countifs_wildcard_escaped_star() {
    // Build a small env with literal "*" in a cell.
    let mut cell_map = HashMap::new();
    let mut values = HashMap::new();
    let a1 = AtomId::from_raw(0);
    let a2 = AtomId::from_raw(1);
    cell_map.insert(CellAddress::new(0, 0), a1);
    cell_map.insert(CellAddress::new(1, 0), a2);
    values.insert(a1, Value::Text("*".into()));
    values.insert(a2, Value::Text("anything".into()));
    // `~*` matches only the literal "*" cell.
    assert_eq!(
        eval_str("=COUNTIFS(A1:A2,\"~*\")", &cell_map, &values),
        Value::Number(1.0)
    );
    // Plain `*` matches both (it's a wildcard).
    assert_eq!(
        eval_str("=COUNTIFS(A1:A2,\"*\")", &cell_map, &values),
        Value::Number(2.0)
    );
}

#[test]
fn countifs_wrong_arg_count() {
    let (cm, vs) = make_multi_env();
    assert_eq!(
        eval_str("=COUNTIFS(A1:A5)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=COUNTIFS(A1:A5,\"x\",B1:B5)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn countifs_shape_mismatch() {
    let (cm, vs) = make_multi_env();
    // A1:A5 (5×1) vs B1:B3 (3×1).
    assert_eq!(
        eval_str("=COUNTIFS(A1:A5,\"x\",B1:B3,\">0\")", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn countifs_empty_match_returns_zero() {
    let (cm, vs) = make_multi_env();
    assert_eq!(
        eval_str("=COUNTIFS(A1:A5,\"zzz\")", &cm, &vs),
        Value::Number(0.0)
    );
}

#[test]
fn countifs_skips_error_cells_in_the_criteria_range() {
    let mut cell_map = HashMap::new();
    let mut values = HashMap::new();
    let a1 = AtomId::from_raw(0);
    cell_map.insert(CellAddress::new(0, 0), a1);
    values.insert(a1, Value::Error(ValueError::WrongType));
    // COUNTIFS 没有值区，条件区是它唯一读的东西 —— 错误格只是「不满足」。
    assert_eq!(
        eval_str("=COUNTIFS(A1:A1,\"x\")", &cell_map, &values),
        Value::Number(0.0)
    );
}
