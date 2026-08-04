//! F.TEST 的方差齐性检验。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

fn ftest_env() -> (HashMap<CellAddress, AtomId>, HashMap<AtomId, Value>) {
    let mut cm: HashMap<CellAddress, AtomId> = HashMap::new();
    let mut vs: HashMap<AtomId, Value> = HashMap::new();
    // A1:A5 = 1,2,3,4,5 (var = 2.5); B1:B5 = 10,20,30,40,50 (var = 250).
    for (r, (a, b)) in [
        (1.0_f64, 10.0_f64),
        (2.0, 20.0),
        (3.0, 30.0),
        (4.0, 40.0),
        (5.0, 50.0),
    ]
    .iter()
    .enumerate()
    {
        let id_a = AtomId::from_raw((r * 2 + 1) as u64);
        let id_b = AtomId::from_raw((r * 2 + 2) as u64);
        cm.insert(CellAddress::new(r as u32, 0), id_a);
        cm.insert(CellAddress::new(r as u32, 1), id_b);
        vs.insert(id_a, Value::Number(*a));
        vs.insert(id_b, Value::Number(*b));
    }
    (cm, vs)
}

#[test]
fn eval_f_test_known() {
    // var1/var2 = 2.5/250 = 0.01. F.DIST(0.01, 4, 4) is small
    // right-tail; symmetric two-tail = 2 * min(P, 1-P).
    use statrs::distribution::{ContinuousCDF, FisherSnedecor};
    let dist = FisherSnedecor::new(4.0, 4.0).unwrap();
    let p_right = 1.0 - dist.cdf(0.01);
    let expected = 2.0 * p_right.min(1.0 - p_right);
    let (cm, vs) = ftest_env();
    match eval_str("=F.TEST(A1:A5, B1:B5)", &cm, &vs) {
        Value::Number(n) => assert!((n - expected).abs() < 1e-9),
        other => panic!("{:?}", other),
    }
    // Alias FTEST.
    match eval_str("=FTEST(A1:A5, B1:B5)", &cm, &vs) {
        Value::Number(n) => assert!((n - expected).abs() < 1e-9),
        other => panic!("{:?}", other),
    }
}

#[test]
fn eval_f_test_zero_variance_is_div_zero() {
    // Column A has constant values (variance 0) → must return #DIV/0!.
    let mut cm: HashMap<CellAddress, AtomId> = HashMap::new();
    let mut vs: HashMap<AtomId, Value> = HashMap::new();
    cm.insert(CellAddress::new(0, 0), AtomId::from_raw(1));
    vs.insert(AtomId::from_raw(1), Value::Number(5.0));
    cm.insert(CellAddress::new(1, 0), AtomId::from_raw(2));
    vs.insert(AtomId::from_raw(2), Value::Number(5.0));
    cm.insert(CellAddress::new(0, 1), AtomId::from_raw(3));
    vs.insert(AtomId::from_raw(3), Value::Number(1.0));
    cm.insert(CellAddress::new(1, 1), AtomId::from_raw(4));
    vs.insert(AtomId::from_raw(4), Value::Number(2.0));
    assert_eq!(
        eval_str("=F.TEST(A1:A2, B1:B2)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_f_test_wrong_arg_count() {
    assert_eq!(ev("=F.TEST(1)"), Value::Error(ValueError::WrongArgCount));
}
