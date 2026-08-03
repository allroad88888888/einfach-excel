//! Z.TEST 的单样本 z 检验。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

fn ztest_env() -> (HashMap<CellAddress, AtomId>, HashMap<AtomId, Value>) {
    // A1:A5 = 3,6,7,8,6 (mean=6, sample sd ≈ 1.871).
    let mut cm: HashMap<CellAddress, AtomId> = HashMap::new();
    let mut vs: HashMap<AtomId, Value> = HashMap::new();
    for (r, v) in [3.0_f64, 6.0, 7.0, 8.0, 6.0].iter().enumerate() {
        let id = AtomId::from_raw((r + 1) as u64);
        cm.insert(CellAddress::new(r as u32, 0), id);
        vs.insert(id, Value::Number(*v));
    }
    (cm, vs)
}

#[test]
fn eval_z_test_two_arg() {
    // x0 = mean → z=0 → p=0.5.
    let (cm, vs) = ztest_env();
    match eval_str("=Z.TEST(A1:A5, 6)", &cm, &vs) {
        Value::Number(n) => assert!((n - 0.5).abs() < 1e-9),
        other => panic!("{:?}", other),
    }
    match eval_str("=ZTEST(A1:A5, 6)", &cm, &vs) {
        Value::Number(n) => assert!((n - 0.5).abs() < 1e-9),
        other => panic!("{:?}", other),
    }
}

#[test]
fn eval_z_test_three_arg() {
    let (cm, vs) = ztest_env();
    // Provide sigma = 2; x0 below mean → p < 0.5.
    match eval_str("=Z.TEST(A1:A5, 5, 2)", &cm, &vs) {
        Value::Number(n) => assert!(n > 0.0 && n < 0.5),
        other => panic!("{:?}", other),
    }
}

#[test]
fn eval_z_test_invalid_sigma() {
    let (cm, vs) = ztest_env();
    assert_eq!(
        eval_str("=Z.TEST(A1:A5, 5, 0)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}

#[test]
fn eval_z_test_single_value_is_error() {
    let mut cm: HashMap<CellAddress, AtomId> = HashMap::new();
    let mut vs: HashMap<AtomId, Value> = HashMap::new();
    cm.insert(CellAddress::new(0, 0), AtomId::from_raw(1));
    vs.insert(AtomId::from_raw(1), Value::Number(5.0));
    assert_eq!(
        eval_str("=Z.TEST(A1:A1, 5)", &cm, &vs),
        Value::Error(ValueError::DivisionByZero)
    );
}
