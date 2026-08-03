//! 区间与标量参与运算时的形状广播。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

// === Implicit arithmetic broadcast ===
//
// These exercise the broadcast path added to `Expr::BinOp` so that a
// multi-cell `Expr::Range` / `Value::Array` operand produces a
// `Value::Array` result (rather than the legacy implicit-intersection
// collapse). The Workbook end-to-end spill behaviour lives in
// `tests/broadcast.rs`; here we cover the evaluator directly.

/// Build a column-major env: A1..A5 = 10, 20, 30, 40, 50;
/// B1..B5 = 1, 2, 3, 4, 5; C1..C3 = 7, 8, 9.
fn make_broadcast_env() -> (HashMap<CellAddress, AtomId>, HashMap<AtomId, Value>) {
    let mut cm = HashMap::new();
    let mut vs = HashMap::new();
    let mut next: u64 = 0;
    let mut put = |cm: &mut HashMap<CellAddress, AtomId>,
                   vs: &mut HashMap<AtomId, Value>,
                   row: u32,
                   col: u32,
                   value: Value| {
        let id = AtomId::from_raw(next);
        next += 1;
        cm.insert(CellAddress::new(row, col), id);
        vs.insert(id, value);
    };
    // A1..A5 (col 0)
    for (i, n) in [10.0, 20.0, 30.0, 40.0, 50.0].iter().enumerate() {
        put(&mut cm, &mut vs, i as u32, 0, Value::Number(*n));
    }
    // B1..B5 (col 1)
    for (i, n) in [1.0, 2.0, 3.0, 4.0, 5.0].iter().enumerate() {
        put(&mut cm, &mut vs, i as u32, 1, Value::Number(*n));
    }
    // C1..C3 (col 2) — used for outer-product 1x3 row source
    for (i, n) in [7.0, 8.0, 9.0].iter().enumerate() {
        put(&mut cm, &mut vs, i as u32, 2, Value::Number(*n));
    }
    (cm, vs)
}

/// Convenience: extract a (rows, cols, data) tuple from a Value::Array
/// result. Panics with a useful message if `v` isn't an Array.
fn broadcast_unwrap_array(v: Value) -> (u32, u32, Vec<Value>) {
    match v {
        Value::Array(arr) => {
            let (r, c) = arr.shape();
            (r, c, arr.data.clone())
        }
        other => panic!("expected Value::Array, got {:?}", other),
    }
}

#[test]
fn broadcast_range_times_scalar_column() {
    let (cm, vs) = make_broadcast_env();
    let v = eval_str("=A1:A5*2", &cm, &vs);
    let (rows, cols, data) = broadcast_unwrap_array(v);
    assert_eq!((rows, cols), (5, 1));
    let expected = [20.0, 40.0, 60.0, 80.0, 100.0];
    for (i, want) in expected.iter().enumerate() {
        assert_eq!(data[i], Value::Number(*want));
    }
}

#[test]
fn broadcast_range_plus_range_elementwise() {
    let (cm, vs) = make_broadcast_env();
    let v = eval_str("=A1:A3+B1:B3", &cm, &vs);
    let (rows, cols, data) = broadcast_unwrap_array(v);
    assert_eq!((rows, cols), (3, 1));
    // 10+1, 20+2, 30+3
    assert_eq!(
        data,
        vec![
            Value::Number(11.0),
            Value::Number(22.0),
            Value::Number(33.0)
        ]
    );
}

#[test]
fn broadcast_range_plus_single_cell_collapses_scalar() {
    let (cm, vs) = make_broadcast_env();
    // B1 is single-cell range; collapses to scalar 1 → broadcasts.
    let v = eval_str("=A1:A3+B1", &cm, &vs);
    let (rows, cols, data) = broadcast_unwrap_array(v);
    assert_eq!((rows, cols), (3, 1));
    assert_eq!(
        data,
        vec![
            Value::Number(11.0),
            Value::Number(21.0),
            Value::Number(31.0)
        ]
    );
}

#[test]
fn broadcast_row_times_col_outer_product() {
    // A1:C1 is 1x3 → (7,? ...) wait that uses row 0. A1:C1 = 10, ?, 7
    // — A1=10, B1=1, C1=7. Use A1:A3 (3x1) * a manual row range.
    // Build env with a clear row + column. Use A1:C1 row times A1:A3 col.
    let (cm, vs) = make_broadcast_env();
    // A1:C1 row vector = [10, 1, 7], A1:A3 column = [10, 20, 30].
    // Outer product should be 3x3, where (i, j) = col[i] * row[j].
    let v = eval_str("=A1:A3*A1:C1", &cm, &vs);
    let (rows, cols, data) = broadcast_unwrap_array(v);
    assert_eq!((rows, cols), (3, 3));
    // row 0: 10*10, 10*1, 10*7 = 100, 10, 70
    // row 1: 20*10, 20*1, 20*7 = 200, 20, 140
    // row 2: 30*10, 30*1, 30*7 = 300, 30, 210
    let expected = [100.0, 10.0, 70.0, 200.0, 20.0, 140.0, 300.0, 30.0, 210.0];
    for (i, want) in expected.iter().enumerate() {
        assert_eq!(data[i], Value::Number(*want));
    }
}

#[test]
fn broadcast_range_times_array_literal() {
    let (cm, vs) = make_broadcast_env();
    // ={2;3;4} is a 3x1 column array literal; element-wise with A1:A3.
    let v = eval_str("=A1:A3*{2;3;4}", &cm, &vs);
    let (rows, cols, data) = broadcast_unwrap_array(v);
    assert_eq!((rows, cols), (3, 1));
    // 10*2, 20*3, 30*4
    assert_eq!(
        data,
        vec![
            Value::Number(20.0),
            Value::Number(60.0),
            Value::Number(120.0)
        ]
    );
}

#[test]
fn broadcast_shape_mismatch_returns_value_error() {
    let (cm, vs) = make_broadcast_env();
    // A1:A3 is 3x1, B1:B5 is 5x1 — incompatible. Excel: #N/A; we use
    // InvalidValue per the documented mapping.
    assert_eq!(
        eval_str("=A1:A3+B1:B5", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn broadcast_comparison_returns_boolean_array() {
    let (cm, vs) = make_broadcast_env();
    let v = eval_str("=A1:A5>15", &cm, &vs);
    let (rows, cols, data) = broadcast_unwrap_array(v);
    assert_eq!((rows, cols), (5, 1));
    // 10>15=F, 20>15=T, 30>15=T, 40>15=T, 50>15=T
    assert_eq!(
        data,
        vec![
            Value::Boolean(false),
            Value::Boolean(true),
            Value::Boolean(true),
            Value::Boolean(true),
            Value::Boolean(true),
        ]
    );
}

#[test]
fn broadcast_per_cell_error_stays_in_array() {
    // Build an env where A2 is text; A1=10, A3=30. `=A1:A3*2` should
    // produce [20, #VALUE!, 60] — the error sits in cell index 1
    // without poisoning the rest of the spill.
    let mut cm = HashMap::new();
    let mut vs = HashMap::new();
    let a1 = AtomId::from_raw(0);
    let a2 = AtomId::from_raw(1);
    let a3 = AtomId::from_raw(2);
    cm.insert(CellAddress::new(0, 0), a1);
    cm.insert(CellAddress::new(1, 0), a2);
    cm.insert(CellAddress::new(2, 0), a3);
    vs.insert(a1, Value::Number(10.0));
    vs.insert(a2, Value::Text("text".into()));
    vs.insert(a3, Value::Number(30.0));
    let v = eval_str("=A1:A3*2", &cm, &vs);
    let (rows, cols, data) = broadcast_unwrap_array(v);
    assert_eq!((rows, cols), (3, 1));
    assert_eq!(data[0], Value::Number(20.0));
    assert_eq!(data[1], Value::Error(ValueError::InvalidValue));
    assert_eq!(data[2], Value::Number(60.0));
}

#[test]
fn broadcast_single_cell_range_stays_scalar() {
    // `=A1:A1+1` should match the scalar path: result is a Number,
    // NOT a 1x1 Array. This proves we don't accidentally widen
    // implicit intersection.
    let (cm, vs) = make_broadcast_env();
    assert_eq!(eval_str("=A1:A1+1", &cm, &vs), Value::Number(11.0));
}
