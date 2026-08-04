//! CHISQ.TEST 的拟合优度检验。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

fn chisq_env() -> (HashMap<CellAddress, AtomId>, HashMap<AtomId, Value>) {
    // Two 1x4 ranges:
    //   A1:D1 actuals  = 10, 20, 30, 40
    //   A2:D2 expected = 15, 15, 35, 35
    let mut cm: HashMap<CellAddress, AtomId> = HashMap::new();
    let mut vs: HashMap<AtomId, Value> = HashMap::new();
    let actuals = [10.0_f64, 20.0, 30.0, 40.0];
    let expecteds = [15.0_f64, 15.0, 35.0, 35.0];
    let mut next: u64 = 1;
    for (c, (a, e)) in actuals.iter().zip(expecteds.iter()).enumerate() {
        let id_a = AtomId::from_raw(next);
        next += 1;
        cm.insert(CellAddress::new(0, c as u32), id_a);
        vs.insert(id_a, Value::Number(*a));
        let id_e = AtomId::from_raw(next);
        next += 1;
        cm.insert(CellAddress::new(1, c as u32), id_e);
        vs.insert(id_e, Value::Number(*e));
    }
    (cm, vs)
}

#[test]
fn eval_chisq_test_known_value() {
    // χ² = (10-15)²/15 + (20-15)²/15 + (30-35)²/35 + (40-35)²/35
    //    = 25/15 + 25/15 + 25/35 + 25/35 = 50/15 + 50/35 ≈ 4.7619.
    // df = (rows-1)*(cols-1) = 0*3 = 0 → fall through to n-1 = 3.
    use statrs::distribution::{ChiSquared, ContinuousCDF};
    let chi2 = 50.0_f64 / 15.0 + 50.0_f64 / 35.0;
    let expected = 1.0 - ChiSquared::new(3.0).unwrap().cdf(chi2);
    let (cm, vs) = chisq_env();
    match eval_str("=CHISQ.TEST(A1:D1, A2:D2)", &cm, &vs) {
        Value::Number(n) => assert!((n - expected).abs() < 1e-9),
        other => panic!("expected number, got {:?}", other),
    }
    // Legacy alias agrees.
    match eval_str("=CHITEST(A1:D1, A2:D2)", &cm, &vs) {
        Value::Number(n) => assert!((n - expected).abs() < 1e-9),
        other => panic!("expected number, got {:?}", other),
    }
}

#[test]
fn eval_chisq_test_shape_mismatch_is_error() {
    let mut cm: HashMap<CellAddress, AtomId> = HashMap::new();
    let mut vs: HashMap<AtomId, Value> = HashMap::new();
    // A1:B1 actuals; A2:C2 expected.
    for c in 0..2 {
        let id = AtomId::from_raw((c + 1) as u64);
        cm.insert(CellAddress::new(0, c as u32), id);
        vs.insert(id, Value::Number(10.0));
    }
    for c in 0..3 {
        let id = AtomId::from_raw((c + 10) as u64);
        cm.insert(CellAddress::new(1, c as u32), id);
        vs.insert(id, Value::Number(10.0));
    }
    assert_eq!(
        eval_str("=CHISQ.TEST(A1:B1, A2:C2)", &cm, &vs),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn eval_chisq_test_zero_expected_is_div_zero() {
    // A1=10, B1=20, A2=15, B2=0 → B2 is zero expected → #DIV/0!.
    let mut cm: HashMap<CellAddress, AtomId> = HashMap::new();
    let mut vs: HashMap<AtomId, Value> = HashMap::new();
    for (idx, (addr, v)) in [
        (CellAddress::new(0, 0), 10.0),
        (CellAddress::new(0, 1), 20.0),
        (CellAddress::new(1, 0), 15.0),
        (CellAddress::new(1, 1), 0.0),
    ]
    .iter()
    .enumerate()
    {
        let id = AtomId::from_raw((idx + 1) as u64);
        cm.insert(*addr, id);
        vs.insert(id, Value::Number(*v));
    }
    assert_eq!(
        eval_str("=CHISQ.TEST(A1:B1, A2:B2)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}
