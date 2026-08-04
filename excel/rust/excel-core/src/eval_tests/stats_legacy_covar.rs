//! COVAR 旧名与 COVARIANCE.P 的等价。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use super::common::*;

#[test]
fn eval_legacy_covar_alias_present() {
    // COVAR was already implemented but not in is_builtin_function_name.
    // Spot-check the path via two 2-element ranges.
    let mut cm: HashMap<CellAddress, AtomId> = HashMap::new();
    let mut vs: HashMap<AtomId, Value> = HashMap::new();
    for (c, (a, b)) in [(1.0_f64, 2.0_f64), (3.0, 4.0)].iter().enumerate() {
        let id_a = AtomId::from_raw((c * 2 + 1) as u64);
        let id_b = AtomId::from_raw((c * 2 + 2) as u64);
        cm.insert(CellAddress::new(0, c as u32), id_a);
        cm.insert(CellAddress::new(1, c as u32), id_b);
        vs.insert(id_a, Value::Number(*a));
        vs.insert(id_b, Value::Number(*b));
    }
    // Mean of (1,3) = 2, mean of (2,4) = 3. Cov(p)= ((1-2)(2-3)+(3-2)(4-3))/2
    //                                              = (1+1)/2 = 1.
    match eval_str("=COVAR(A1:B1, A2:B2)", &cm, &vs) {
        Value::Number(n) => assert!((n - 1.0).abs() < 1e-9),
        other => panic!("{:?}", other),
    }
    match eval_str("=COVARIANCE.P(A1:B1, A2:B2)", &cm, &vs) {
        Value::Number(n) => assert!((n - 1.0).abs() < 1e-9),
        other => panic!("{:?}", other),
    }
    // COVARIANCE.S = sample: divide by (n-1) = 1 → 2.
    match eval_str("=COVARIANCE.S(A1:B1, A2:B2)", &cm, &vs) {
        Value::Number(n) => assert!((n - 2.0).abs() < 1e-9),
        other => panic!("{:?}", other),
    }
}
