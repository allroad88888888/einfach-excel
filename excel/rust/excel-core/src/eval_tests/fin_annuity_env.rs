//! 年金与现金流家族共用的利率现金流夹具。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;

// === Financial tests ===
//
// The env used here populates A1..A4 with the cash-flow sequence
// [-100, 30, 40, 50] (IRR ≈ 8.896%). Some PMT/PV/FV tests use the
// canonical 30-year-loan: rate=0.005/mo, nper=360, pv=200000.

pub(super) fn make_finance_env() -> (HashMap<CellAddress, AtomId>, HashMap<AtomId, Value>) {
    let mut cell_map = HashMap::new();
    let mut values = HashMap::new();
    // A1..A4 → cash flows; B1 holds a non-numeric value for type errors;
    // C1..C3 → all-positive cash flow scenario for IRR sign-check.
    let flows = [-100.0, 30.0, 40.0, 50.0];
    for (i, v) in flows.iter().enumerate() {
        let id = AtomId::from_raw(i as u64);
        cell_map.insert(CellAddress::new(i as u32, 0), id);
        values.insert(id, Value::Number(*v));
    }
    let b1 = AtomId::from_raw(100);
    cell_map.insert(CellAddress::new(0, 1), b1);
    values.insert(b1, Value::Text("bad".into()));

    for (i, v) in [10.0_f64, 20.0, 30.0].iter().enumerate() {
        let id = AtomId::from_raw(200 + i as u64);
        cell_map.insert(CellAddress::new(i as u32, 2), id);
        values.insert(id, Value::Number(*v));
    }
    (cell_map, values)
}
