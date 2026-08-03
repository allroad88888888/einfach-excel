//! SORT/SORTBY 的排序键与稳定性。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

// --- SORT ---

fn make_sort_env_1d() -> (HashMap<CellAddress, AtomId>, HashMap<AtomId, Value>) {
    // A1..A3 = [3, 1, 2].
    let mut cell_map = HashMap::new();
    let mut values = HashMap::new();
    for (row, n) in [3.0, 1.0, 2.0].iter().enumerate() {
        let id = AtomId::from_raw(row as u64);
        cell_map.insert(CellAddress::new(row as u32, 0), id);
        values.insert(id, Value::Number(*n));
    }
    (cell_map, values)
}

#[test]
fn eval_sort_ascending_default() {
    let (cm, vs) = make_sort_env_1d();
    let (r, c, data) = unwrap_array(eval_str("=SORT(A1:A3)", &cm, &vs));
    assert_eq!((r, c), (3, 1));
    assert_eq!(
        data,
        vec![Value::Number(1.0), Value::Number(2.0), Value::Number(3.0)]
    );
}

#[test]
fn eval_sort_descending() {
    let (cm, vs) = make_sort_env_1d();
    let (r, c, data) = unwrap_array(eval_str("=SORT(A1:A3, 1, -1)", &cm, &vs));
    assert_eq!((r, c), (3, 1));
    assert_eq!(
        data,
        vec![Value::Number(3.0), Value::Number(2.0), Value::Number(1.0)]
    );
}

#[test]
fn eval_sort_multi_column_by_column_2() {
    // 2x2 grid: row 0 = ["b", 1], row 1 = ["a", 2]
    // Sort by column 2 ascending → row order [0, 1] (1 < 2) → unchanged.
    // Sort by column 2 descending → row order [1, 0].
    let mut cell_map = HashMap::new();
    let mut values = HashMap::new();
    let a1 = AtomId::from_raw(0);
    let b1 = AtomId::from_raw(1);
    let a2 = AtomId::from_raw(2);
    let b2 = AtomId::from_raw(3);
    cell_map.insert(CellAddress::new(0, 0), a1);
    cell_map.insert(CellAddress::new(0, 1), b1);
    cell_map.insert(CellAddress::new(1, 0), a2);
    cell_map.insert(CellAddress::new(1, 1), b2);
    values.insert(a1, Value::Text("b".into()));
    values.insert(b1, Value::Number(1.0));
    values.insert(a2, Value::Text("a".into()));
    values.insert(b2, Value::Number(2.0));

    let (r, c, data) = unwrap_array(eval_str("=SORT(A1:B2, 2, -1)", &cell_map, &values));
    assert_eq!((r, c), (2, 2));
    // Descending by col 2 → row 1 first (2), then row 0 (1).
    assert_eq!(
        data,
        vec![
            Value::Text("a".into()),
            Value::Number(2.0),
            Value::Text("b".into()),
            Value::Number(1.0),
        ]
    );
}

#[test]
fn eval_sort_invalid_order() {
    let (cm, vs) = make_sort_env_1d();
    assert_eq!(
        eval_str("=SORT(A1:A3, 1, 99)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn eval_sort_invalid_sort_index() {
    let (cm, vs) = make_sort_env_1d();
    // sort_index = 99 > cols (1) → InvalidValue.
    assert_eq!(
        eval_str("=SORT(A1:A3, 99)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn eval_sortby_single_key_asc() {
    let (cm, vs) = make_sortby_env_multi_key();
    // Sort col A by col B ascending. Col B is [1,1,2,2] so the order
    // is stable: rows [0,1,2,3] → unchanged.
    let (r, c, data) = unwrap_array(eval_str("=SORTBY(A1:A4, B1:B4)", &cm, &vs));
    assert_eq!((r, c), (4, 1));
    assert_eq!(
        data,
        vec![
            Value::Text("w".into()),
            Value::Text("x".into()),
            Value::Text("y".into()),
            Value::Text("z".into()),
        ]
    );
}

#[test]
fn eval_sortby_single_key_desc() {
    let (cm, vs) = make_sortby_env_multi_key();
    // Sort col A by col B descending. Col B = [1,1,2,2] → rows with
    // key 2 first (rows 2, 3, stable), then rows with key 1.
    let (r, c, data) = unwrap_array(eval_str("=SORTBY(A1:A4, B1:B4, -1)", &cm, &vs));
    assert_eq!((r, c), (4, 1));
    assert_eq!(
        data,
        vec![
            Value::Text("y".into()),
            Value::Text("z".into()),
            Value::Text("w".into()),
            Value::Text("x".into()),
        ]
    );
}

#[test]
fn eval_sortby_multi_key_stable_tiebreak() {
    let (cm, vs) = make_sortby_env_multi_key();
    // Sort by B asc, ties broken by C asc.
    // Keys: (1,20), (1,10), (2,20), (2,10).
    // Within B=1: prefer C=10 → row 1 first, then row 0.
    // Within B=2: prefer C=10 → row 3 first, then row 2.
    // Expected order: x, w, z, y.
    let (r, c, data) = unwrap_array(eval_str("=SORTBY(A1:A4, B1:B4, 1, C1:C4, 1)", &cm, &vs));
    assert_eq!((r, c), (4, 1));
    assert_eq!(
        data,
        vec![
            Value::Text("x".into()),
            Value::Text("w".into()),
            Value::Text("z".into()),
            Value::Text("y".into()),
        ]
    );
}

#[test]
fn eval_sortby_wrong_arg_count() {
    let (cm, vs) = make_sortby_env_multi_key();
    assert_eq!(
        eval_str("=SORTBY(A1:A4)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

#[test]
fn eval_sortby_by_array_shape_mismatch() {
    let (cm, vs) = make_sortby_env_multi_key();
    // by_array has 3 rows but array has 4 → InvalidValue.
    assert_eq!(
        eval_str("=SORTBY(A1:A4, B1:B3)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

fn make_sortby_env_multi_key() -> (HashMap<CellAddress, AtomId>, HashMap<AtomId, Value>) {
    // A: data  ["w", "x", "y", "z"]
    // B: key1  [1,   1,   2,   2]
    // C: key2  [20,  10,  20,  10]
    let mut cm = HashMap::new();
    let mut vs = HashMap::new();
    let data = ["w", "x", "y", "z"];
    let k1 = [1.0, 1.0, 2.0, 2.0];
    let k2 = [20.0, 10.0, 20.0, 10.0];
    let mut next = 0u64;
    for (r, ((t, n1), n2)) in data.iter().zip(k1.iter()).zip(k2.iter()).enumerate() {
        let a_id = AtomId::from_raw(next);
        next += 1;
        cm.insert(CellAddress::new(r as u32, 0), a_id);
        vs.insert(a_id, Value::Text((*t).into()));
        let b_id = AtomId::from_raw(next);
        next += 1;
        cm.insert(CellAddress::new(r as u32, 1), b_id);
        vs.insert(b_id, Value::Number(*n1));
        let c_id = AtomId::from_raw(next);
        next += 1;
        cm.insert(CellAddress::new(r as u32, 2), c_id);
        vs.insert(c_id, Value::Number(*n2));
    }
    (cm, vs)
}
