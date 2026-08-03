//! T.TEST 的配对与双样本检验。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

fn ttest_env() -> (HashMap<CellAddress, AtomId>, HashMap<AtomId, Value>) {
    // Two paired samples, n=5.
    let mut cm: HashMap<CellAddress, AtomId> = HashMap::new();
    let mut vs: HashMap<AtomId, Value> = HashMap::new();
    for (r, (a, b)) in [
        (1.0_f64, 2.0_f64),
        (2.0, 4.0),
        (3.0, 5.0),
        (4.0, 7.0),
        (5.0, 9.0),
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
fn eval_t_test_paired_known() {
    // Paired diffs: -1, -2, -2, -3, -4 → mean = -2.4, var = 1.3.
    // SE = sqrt(1.3/5) ≈ 0.5099. t ≈ -4.7064. df=4.
    // Two-tail p ≈ 0.009240 (well-known reference value).
    let (cm, vs) = ttest_env();
    match eval_str("=T.TEST(A1:A5, B1:B5, 2, 1)", &cm, &vs) {
        Value::Number(n) => assert!((n - 0.009_240).abs() < 1e-4, "got {}", n),
        other => panic!("{:?}", other),
    }
}

#[test]
fn eval_t_test_two_sample_equal_var() {
    let (cm, vs) = ttest_env();
    match eval_str("=T.TEST(A1:A5, B1:B5, 2, 2)", &cm, &vs) {
        Value::Number(n) => assert!(n > 0.0 && n < 1.0),
        other => panic!("{:?}", other),
    }
}

#[test]
fn eval_t_test_welch() {
    let (cm, vs) = ttest_env();
    match eval_str("=T.TEST(A1:A5, B1:B5, 2, 3)", &cm, &vs) {
        Value::Number(n) => assert!(n > 0.0 && n < 1.0),
        other => panic!("{:?}", other),
    }
}

#[test]
fn eval_t_test_invalid_type() {
    let (cm, vs) = ttest_env();
    assert_eq!(
        eval_str("=T.TEST(A1:A5, B1:B5, 2, 4)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_t_test_invalid_tails() {
    let (cm, vs) = ttest_env();
    assert_eq!(
        eval_str("=T.TEST(A1:A5, B1:B5, 3, 1)", &cm, &vs),
        Value::Error(ValueError::Overflow)
    );
}

#[test]
fn eval_t_test_legacy_alias() {
    let (cm, vs) = ttest_env();
    let a = match eval_str("=T.TEST(A1:A5, B1:B5, 2, 2)", &cm, &vs) {
        Value::Number(n) => n,
        other => panic!("{:?}", other),
    };
    let b = match eval_str("=TTEST(A1:A5, B1:B5, 2, 2)", &cm, &vs) {
        Value::Number(n) => n,
        other => panic!("{:?}", other),
    };
    assert!((a - b).abs() < 1e-12);
}
