//! UNIQUE 的去重与 exactly_once 模式。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

// --- UNIQUE ---
//
// No `={...}` literal-array syntax in Phase 3 — drive UNIQUE inputs
// through cell ranges so the surrounding test fixture stays the
// same shape as the rest of the eval suite.

fn make_unique_env() -> (HashMap<CellAddress, AtomId>, HashMap<AtomId, Value>) {
    // A1..A5 = [1, 2, 2, 3, 1] → single-column dedupe case.
    let mut cell_map = HashMap::new();
    let mut values = HashMap::new();
    for (row, n) in [1.0, 2.0, 2.0, 3.0, 1.0].iter().enumerate() {
        let id = AtomId::from_raw(row as u64);
        cell_map.insert(CellAddress::new(row as u32, 0), id);
        values.insert(id, Value::Number(*n));
    }
    (cell_map, values)
}

#[test]
fn eval_unique_single_column_dedupes() {
    let (cm, vs) = make_unique_env();
    let (r, c, data) = unwrap_array(eval_str("=UNIQUE(A1:A5)", &cm, &vs));
    assert_eq!((r, c), (3, 1));
    assert_eq!(
        data,
        vec![Value::Number(1.0), Value::Number(2.0), Value::Number(3.0)]
    );
}

#[test]
fn eval_unique_2d_row_dedupe() {
    // Build a 3x2 grid where rows 0 and 2 are identical.
    //   A1=1 B1=2
    //   A2=3 B2=4
    //   A3=1 B3=2
    let mut cell_map = HashMap::new();
    let mut values = HashMap::new();
    let rows = [[1.0, 2.0], [3.0, 4.0], [1.0, 2.0]];
    let mut next = 0u64;
    for (r, row) in rows.iter().enumerate() {
        for (c, &n) in row.iter().enumerate() {
            let id = AtomId::from_raw(next);
            next += 1;
            cell_map.insert(CellAddress::new(r as u32, c as u32), id);
            values.insert(id, Value::Number(n));
        }
    }
    let (out_r, out_c, data) = unwrap_array(eval_str("=UNIQUE(A1:B3)", &cell_map, &values));
    assert_eq!((out_r, out_c), (2, 2));
    assert_eq!(
        data,
        vec![
            Value::Number(1.0),
            Value::Number(2.0),
            Value::Number(3.0),
            Value::Number(4.0),
        ]
    );
}

#[test]
fn eval_unique_by_col() {
    // 2x3 grid where cols 0 and 2 are identical.
    //   A1=1 B1=2 C1=1
    //   A2=3 B2=4 C2=3
    let mut cell_map = HashMap::new();
    let mut values = HashMap::new();
    let grid = [[1.0, 2.0, 1.0], [3.0, 4.0, 3.0]];
    let mut next = 0u64;
    for (r, row) in grid.iter().enumerate() {
        for (c, &n) in row.iter().enumerate() {
            let id = AtomId::from_raw(next);
            next += 1;
            cell_map.insert(CellAddress::new(r as u32, c as u32), id);
            values.insert(id, Value::Number(n));
        }
    }
    let (out_r, out_c, data) =
        unwrap_array(eval_str("=UNIQUE(A1:C2, TRUE)", &cell_map, &values));
    assert_eq!((out_r, out_c), (2, 2));
    // Row-major output: col 0 then col 1 (the originals minus the dup).
    // First seen: [1, 2], so kept cols are [1, 2].
    assert_eq!(
        data,
        vec![
            Value::Number(1.0),
            Value::Number(2.0),
            Value::Number(3.0),
            Value::Number(4.0),
        ]
    );
}

#[test]
fn eval_unique_exactly_once_drops_duplicates() {
    let (cm, vs) = make_unique_env();
    let (r, c, data) = unwrap_array(eval_str("=UNIQUE(A1:A5, FALSE, TRUE)", &cm, &vs));
    // Input: [1, 2, 2, 3, 1]. Counts: 1→2, 2→2, 3→1. Only 3 appears
    // exactly once → keep only [3].
    assert_eq!((r, c), (1, 1));
    assert_eq!(data, vec![Value::Number(3.0)]);
}

#[test]
fn eval_unique_exactly_once_all_dropped_calc() {
    // Build a column where everything is duplicated → exactly_once
    // drops everything → #CALC!.
    let mut cell_map = HashMap::new();
    let mut values = HashMap::new();
    for (row, n) in [1.0, 2.0, 1.0, 2.0].iter().enumerate() {
        let id = AtomId::from_raw(row as u64);
        cell_map.insert(CellAddress::new(row as u32, 0), id);
        values.insert(id, Value::Number(*n));
    }
    assert_eq!(
        eval_str("=UNIQUE(A1:A4, FALSE, TRUE)", &cell_map, &values),
        Value::Error(ValueError::Calc)
    );
}
