//! VLOOKUP/HLOOKUP/INDEX+MATCH 的精确与近似匹配。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;
use super::lookup_env::*;

#[test]
fn eval_vlookup_finds_row() {
    let (cm, vs) = make_lookup_env();
    // VLOOKUP(2, A1:B3, 2) → 20
    assert_eq!(
        eval_str("=VLOOKUP(2,A1:B3,2)", &cm, &vs),
        Value::Number(20.0)
    );
    // VLOOKUP(99, ..., FALSE) → #N/A in exact mode (default became
    // approximate after C.3, matching Excel; old test expected exact).
    assert!(matches!(
        eval_str("=VLOOKUP(99,A1:B3,2,FALSE)", &cm, &vs),
        Value::Error(_)
    ));
}

#[test]
fn eval_index_match() {
    let (cm, vs) = make_lookup_env();
    // INDEX(A1:B3, 2, 2) → 20 (row 2 col 2 = price for id 2)
    assert_eq!(eval_str("=INDEX(A1:B3,2,2)", &cm, &vs), Value::Number(20.0));
    // MATCH(2, A1:A3, 0) → 2 (1-based)
    assert_eq!(eval_str("=MATCH(2,A1:A3,0)", &cm, &vs), Value::Number(2.0));
}

#[test]
fn eval_hlookup_finds_col() {
    // Build a horizontal table: row 0 = headers, row 1 = values.
    let mut cm = HashMap::new();
    let mut vs = HashMap::new();
    for (i, (h, v)) in [("a", 1), ("b", 2), ("c", 3)].iter().enumerate() {
        let col = i as u32;
        let h_atom = AtomId::from_raw((col * 2) as u64);
        let v_atom = AtomId::from_raw((col * 2 + 1) as u64);
        cm.insert(CellAddress::new(0, col), h_atom);
        cm.insert(CellAddress::new(1, col), v_atom);
        vs.insert(h_atom, Value::Text((*h).into()));
        vs.insert(v_atom, Value::Number(*v as f64));
    }
    // HLOOKUP("b", A1:C2, 2) → 2
    assert_eq!(
        eval_str("=HLOOKUP(\"b\",A1:C2,2)", &cm, &vs),
        Value::Number(2.0)
    );
}

#[test]
fn eval_vlookup_approximate_match() {
    // Tax bracket lookup: thresholds 0/100/1000/10000 -> rates
    let mut cm = HashMap::new();
    let mut vs = HashMap::new();
    for (i, (threshold, rate)) in [(0.0, 5.0), (100.0, 10.0), (1000.0, 20.0), (10000.0, 30.0)]
        .iter()
        .enumerate()
    {
        let row = i as u32;
        let t = AtomId::from_raw((row * 2) as u64);
        let r = AtomId::from_raw((row * 2 + 1) as u64);
        cm.insert(CellAddress::new(row, 0), t);
        cm.insert(CellAddress::new(row, 1), r);
        vs.insert(t, Value::Number(*threshold));
        vs.insert(r, Value::Number(*rate));
    }
    // Approximate (4th arg = TRUE / omitted): largest threshold <= 500 is 100 -> 10
    assert_eq!(
        eval_str("=VLOOKUP(500,A1:B4,2)", &cm, &vs),
        Value::Number(10.0)
    );
    assert_eq!(
        eval_str("=VLOOKUP(500,A1:B4,2,TRUE)", &cm, &vs),
        Value::Number(10.0)
    );
    // 12000 -> 10000 bracket -> 30
    assert_eq!(
        eval_str("=VLOOKUP(12000,A1:B4,2)", &cm, &vs),
        Value::Number(30.0)
    );
    // Below smallest -> #N/A.
    assert!(matches!(
        eval_str("=VLOOKUP(-1,A1:B4,2)", &cm, &vs),
        Value::Error(_)
    ));
    // Exact mode (FALSE) on 500 -> #N/A because 500 isn't in the column
    assert!(matches!(
        eval_str("=VLOOKUP(500,A1:B4,2,FALSE)", &cm, &vs),
        Value::Error(_)
    ));
    // Exact match on 100 -> 10
    assert_eq!(
        eval_str("=VLOOKUP(100,A1:B4,2,FALSE)", &cm, &vs),
        Value::Number(10.0)
    );
}
