//! FILTER 的布尔筛选与空结果回退。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

// --- FILTER ---

fn make_filter_env() -> (HashMap<CellAddress, AtomId>, HashMap<AtomId, Value>) {
    // A1..A4 = [10, 20, 30, 40] (the array).
    // B1..B4 = [TRUE, FALSE, TRUE, FALSE] (the include mask).
    let mut cell_map = HashMap::new();
    let mut values = HashMap::new();
    for (row, n) in [10.0, 20.0, 30.0, 40.0].iter().enumerate() {
        let id = AtomId::from_raw(row as u64);
        cell_map.insert(CellAddress::new(row as u32, 0), id);
        values.insert(id, Value::Number(*n));
    }
    for (row, b) in [true, false, true, false].iter().enumerate() {
        let id = AtomId::from_raw(100 + row as u64);
        cell_map.insert(CellAddress::new(row as u32, 1), id);
        values.insert(id, Value::Boolean(*b));
    }
    (cell_map, values)
}

#[test]
fn eval_filter_basic() {
    let (cm, vs) = make_filter_env();
    let (r, c, data) = unwrap_array(eval_str("=FILTER(A1:A4, B1:B4)", &cm, &vs));
    assert_eq!((r, c), (2, 1));
    assert_eq!(data, vec![Value::Number(10.0), Value::Number(30.0)]);
}

#[test]
fn eval_filter_all_false_no_if_empty_calc() {
    // Mask: A1..A4 = [10, 20, 30, 40], include: B1..B4 = [FALSE,FALSE,FALSE,FALSE].
    let mut cm = HashMap::new();
    let mut vs = HashMap::new();
    for (row, n) in [10.0, 20.0, 30.0, 40.0].iter().enumerate() {
        let id = AtomId::from_raw(row as u64);
        cm.insert(CellAddress::new(row as u32, 0), id);
        vs.insert(id, Value::Number(*n));
    }
    for row in 0..4 {
        let id = AtomId::from_raw(100 + row as u64);
        cm.insert(CellAddress::new(row, 1), id);
        vs.insert(id, Value::Boolean(false));
    }
    assert_eq!(
        eval_str("=FILTER(A1:A4, B1:B4)", &cm, &vs),
        Value::Error(ValueError::Calc)
    );
}

#[test]
fn eval_filter_all_false_with_if_empty() {
    let mut cm = HashMap::new();
    let mut vs = HashMap::new();
    for (row, n) in [10.0, 20.0, 30.0, 40.0].iter().enumerate() {
        let id = AtomId::from_raw(row as u64);
        cm.insert(CellAddress::new(row as u32, 0), id);
        vs.insert(id, Value::Number(*n));
    }
    for row in 0..4 {
        let id = AtomId::from_raw(100 + row as u64);
        cm.insert(CellAddress::new(row, 1), id);
        vs.insert(id, Value::Boolean(false));
    }
    let (r, c, data) = unwrap_array(eval_str("=FILTER(A1:A4, B1:B4, \"none\")", &cm, &vs));
    assert_eq!((r, c), (1, 1));
    assert_eq!(data, vec![Value::Text("none".into())]);
}

#[test]
fn eval_filter_shape_mismatch() {
    let (cm, vs) = make_filter_env();
    // Use a 3-row mask against a 4-row array — neither a row-vector
    // (B1:B1, cols=2) nor a column-vector (B1:B3, rows=3 ≠ 4) shape
    // matches; expect InvalidValue.
    assert_eq!(
        eval_str("=FILTER(A1:A4, B1:B3)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn eval_filter_row_vector_filters_columns() {
    // 2x3 array, 1x3 include vector → keep matching columns.
    //   A1=1 B1=2 C1=3
    //   A2=4 B2=5 C2=6
    //   A3=TRUE B3=FALSE C3=TRUE (include row)
    let mut cm = HashMap::new();
    let mut vs = HashMap::new();
    let mut next = 0u64;
    for (r, row) in [[1.0, 2.0, 3.0], [4.0, 5.0, 6.0]].iter().enumerate() {
        for (c, &n) in row.iter().enumerate() {
            let id = AtomId::from_raw(next);
            next += 1;
            cm.insert(CellAddress::new(r as u32, c as u32), id);
            vs.insert(id, Value::Number(n));
        }
    }
    // Row 2 (zero-indexed) is the include row.
    for (c, b) in [true, false, true].iter().enumerate() {
        let id = AtomId::from_raw(200 + c as u64);
        cm.insert(CellAddress::new(2, c as u32), id);
        vs.insert(id, Value::Boolean(*b));
    }
    let (r, c, data) = unwrap_array(eval_str("=FILTER(A1:C2, A3:C3)", &cm, &vs));
    assert_eq!((r, c), (2, 2));
    // Keep cols 0 and 2 of each row.
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
