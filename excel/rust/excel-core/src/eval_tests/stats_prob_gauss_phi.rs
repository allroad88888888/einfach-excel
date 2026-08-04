//! PROB/GAUSS/PHI 的概率密度与累积查询。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

// --- PROB ---

#[test]
fn prob_single_point() {
    // x={1,2,3}, p={0.2,0.5,0.3}; PROB(x, p, 2) → 0.5.
    // Use cell-backed ranges so collect_paired_numbers can shape-match.
    use crate::cell::CellAddress;
    use einfach_core::AtomId;
    let mut cm: HashMap<CellAddress, AtomId> = HashMap::new();
    let mut vs: HashMap<AtomId, Value> = HashMap::new();
    let mk = |row: u32,
              col: u32,
              val: Value,
              cm: &mut HashMap<CellAddress, AtomId>,
              vs: &mut HashMap<AtomId, Value>| {
        let id = AtomId::from_raw(row as u64 * 100 + col as u64);
        cm.insert(CellAddress::new(row, col), id);
        vs.insert(id, val);
    };
    mk(0, 0, Value::Number(1.0), &mut cm, &mut vs);
    mk(1, 0, Value::Number(2.0), &mut cm, &mut vs);
    mk(2, 0, Value::Number(3.0), &mut cm, &mut vs);
    mk(0, 1, Value::Number(0.2), &mut cm, &mut vs);
    mk(1, 1, Value::Number(0.5), &mut cm, &mut vs);
    mk(2, 1, Value::Number(0.3), &mut cm, &mut vs);
    match eval_str("=PROB(A1:A3, B1:B3, 2)", &cm, &vs) {
        Value::Number(n) => assert!(approx(n, 0.5, 1e-9), "got {}", n),
        other => panic!("{:?}", other),
    }
    // Range form: PROB(x, p, 2, 3) → 0.5 + 0.3 = 0.8.
    match eval_str("=PROB(A1:A3, B1:B3, 2, 3)", &cm, &vs) {
        Value::Number(n) => assert!(approx(n, 0.8, 1e-9), "got {}", n),
        other => panic!("{:?}", other),
    }
}

#[test]
fn prob_rejects_unnormalized() {
    use crate::cell::CellAddress;
    use einfach_core::AtomId;
    let mut cm: HashMap<CellAddress, AtomId> = HashMap::new();
    let mut vs: HashMap<AtomId, Value> = HashMap::new();
    let id1 = AtomId::from_raw(1);
    let id2 = AtomId::from_raw(2);
    let id3 = AtomId::from_raw(3);
    let id4 = AtomId::from_raw(4);
    cm.insert(CellAddress::new(0, 0), id1);
    cm.insert(CellAddress::new(1, 0), id2);
    cm.insert(CellAddress::new(0, 1), id3);
    cm.insert(CellAddress::new(1, 1), id4);
    vs.insert(id1, Value::Number(1.0));
    vs.insert(id2, Value::Number(2.0));
    vs.insert(id3, Value::Number(0.3));
    vs.insert(id4, Value::Number(0.4));
    // Sum 0.7 ≠ 1 → #NUM!.
    assert_eq!(
        eval_str("=PROB(A1:A2, B1:B2, 1, 2)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn prob_rejects_out_of_range_prob() {
    use crate::cell::CellAddress;
    use einfach_core::AtomId;
    let mut cm: HashMap<CellAddress, AtomId> = HashMap::new();
    let mut vs: HashMap<AtomId, Value> = HashMap::new();
    let id1 = AtomId::from_raw(11);
    let id2 = AtomId::from_raw(12);
    let id3 = AtomId::from_raw(13);
    let id4 = AtomId::from_raw(14);
    cm.insert(CellAddress::new(0, 0), id1);
    cm.insert(CellAddress::new(1, 0), id2);
    cm.insert(CellAddress::new(0, 1), id3);
    cm.insert(CellAddress::new(1, 1), id4);
    vs.insert(id1, Value::Number(1.0));
    vs.insert(id2, Value::Number(2.0));
    vs.insert(id3, Value::Number(1.5)); // > 1 invalid
    vs.insert(id4, Value::Number(-0.5));
    assert_eq!(
        eval_str("=PROB(A1:A2, B1:B2, 1)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
}

// --- GAUSS ---

#[test]
fn gauss_zero() {
    let (cm, vs) = make_test_env();
    match eval_str("=GAUSS(0)", &cm, &vs) {
        Value::Number(n) => assert!(n.abs() < 1e-12, "GAUSS(0) = {}", n),
        other => panic!("{:?}", other),
    }
}

#[test]
fn gauss_one_sigma() {
    let (cm, vs) = make_test_env();
    // GAUSS(1) ≈ 0.341344746... (68% rule: 68/2 ≈ 34.13%).
    match eval_str("=GAUSS(1)", &cm, &vs) {
        Value::Number(n) => assert!(approx(n, 0.3413447461, 1e-6), "got {}", n),
        other => panic!("{:?}", other),
    }
}

#[test]
fn gauss_arg_count() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=GAUSS()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
    assert_eq!(
        eval_str("=GAUSS(1, 2)", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}

// --- PHI ---

#[test]
fn phi_zero_peak() {
    let (cm, vs) = make_test_env();
    // φ(0) = 1/sqrt(2π) ≈ 0.39894228.
    match eval_str("=PHI(0)", &cm, &vs) {
        Value::Number(n) => assert!(approx(n, 0.3989422804, 1e-6), "got {}", n),
        other => panic!("{:?}", other),
    }
}

#[test]
fn phi_symmetric() {
    let (cm, vs) = make_test_env();
    // φ(x) is even: PHI(1) == PHI(-1).
    let a = eval_str("=PHI(1)", &cm, &vs);
    let b = eval_str("=PHI(-1)", &cm, &vs);
    match (a, b) {
        (Value::Number(x), Value::Number(y)) => assert!(approx(x, y, 1e-12)),
        other => panic!("{:?}", other),
    }
}

#[test]
fn phi_arg_count() {
    let (cm, vs) = make_test_env();
    assert_eq!(
        eval_str("=PHI()", &cm, &vs),
        Value::Error(ValueError::WrongArgCount)
    );
}
