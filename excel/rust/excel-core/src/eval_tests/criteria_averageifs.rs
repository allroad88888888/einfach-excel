//! AVERAGEIFS 的多条件平均。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;
use super::criteria_env::*;

// ---- AVERAGEIFS ----

#[test]
fn averageifs_happy_path() {
    let (cm, vs) = make_multi_env();
    // Avg B where color=red AND B>=30 → (30+40)/2 = 35.
    assert_eq!(
        eval_str("=AVERAGEIFS(B1:B5,C1:C5,\"red\",B1:B5,\">=30\")", &cm, &vs),
        Value::Number(35.0)
    );
}

#[test]
fn averageifs_wildcard() {
    let (cm, vs) = make_multi_env();
    // Avg B where name matches "?pple" → (10+50)/2 = 30.
    assert_eq!(
        eval_str("=AVERAGEIFS(B1:B5,A1:A5,\"?pple\")", &cm, &vs),
        Value::Number(30.0)
    );
}

#[test]
fn averageifs_wrong_arg_count() {
    let (cm, vs) = make_multi_env();
    assert_eq!(
        eval_str("=AVERAGEIFS(B1:B5)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=AVERAGEIFS(B1:B5,A1:A5)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn averageifs_shape_mismatch() {
    let (cm, vs) = make_multi_env();
    assert_eq!(
        eval_str("=AVERAGEIFS(B1:B5,A1:A3,\"apple\")", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn averageifs_empty_match_returns_div_zero() {
    let (cm, vs) = make_multi_env();
    assert_eq!(
        eval_str("=AVERAGEIFS(B1:B5,A1:A5,\"zzz\")", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn averageifs_error_propagation() {
    let mut cell_map = HashMap::new();
    let mut values = HashMap::new();
    let a1 = AtomId::from_raw(0);
    let b1 = AtomId::from_raw(1);
    cell_map.insert(CellAddress::new(0, 0), a1);
    cell_map.insert(CellAddress::new(0, 1), b1);
    values.insert(a1, Value::Text("x".into()));
    values.insert(b1, Value::Error(ValueError::WrongType));
    // Value-range error propagates when a matching row's value is an error.
    assert_eq!(
        eval_str("=AVERAGEIFS(B1:B1,A1:A1,\"x\")", &cell_map, &values),
        Value::Error(ValueError::WrongType)
    );
}
