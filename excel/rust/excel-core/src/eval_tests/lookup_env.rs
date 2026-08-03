//! 查找函数家族共用的纵向查找表夹具。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;

// === Phase 5 tests ===

pub(super) fn make_lookup_env() -> (HashMap<CellAddress, AtomId>, HashMap<AtomId, Value>) {
    // Three rows of (id, price): (1, 10), (2, 20), (3, 30) at A1:B3.
    let mut cell_map = HashMap::new();
    let mut values = HashMap::new();
    for (i, (id, price)) in [(1, 10), (2, 20), (3, 30)].iter().enumerate() {
        let row = i as u32;
        let id_atom = AtomId::from_raw((row * 2) as u64);
        let price_atom = AtomId::from_raw((row * 2 + 1) as u64);
        cell_map.insert(CellAddress::new(row, 0), id_atom);
        cell_map.insert(CellAddress::new(row, 1), price_atom);
        values.insert(id_atom, Value::Number(*id as f64));
        values.insert(price_atom, Value::Number(*price as f64));
    }
    (cell_map, values)
}
