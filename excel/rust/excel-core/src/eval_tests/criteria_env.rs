//! 条件聚合家族共用的多列数据夹具。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;

// === Multi-criteria aggregate tests ===

pub(super) fn make_multi_env() -> (HashMap<CellAddress, AtomId>, HashMap<AtomId, Value>) {
    // Layout:
    //   A1=apple   B1=10   C1=red
    //   A2=banana  B2=20   C2=yellow
    //   A3=apricot B3=30   C3=red
    //   A4=cherry  B4=40   C4=red
    //   A5=apple   B5=50   C5=green
    let mut cell_map = HashMap::new();
    let mut values = HashMap::new();
    let rows: [(&str, f64, &str); 5] = [
        ("apple", 10.0, "red"),
        ("banana", 20.0, "yellow"),
        ("apricot", 30.0, "red"),
        ("cherry", 40.0, "red"),
        ("apple", 50.0, "green"),
    ];
    let mut next_id: u64 = 0;
    for (row, (name, n, color)) in rows.iter().enumerate() {
        let r = row as u32;
        let a = AtomId::from_raw(next_id);
        next_id += 1;
        let b = AtomId::from_raw(next_id);
        next_id += 1;
        let c = AtomId::from_raw(next_id);
        next_id += 1;
        cell_map.insert(CellAddress::new(r, 0), a);
        cell_map.insert(CellAddress::new(r, 1), b);
        cell_map.insert(CellAddress::new(r, 2), c);
        values.insert(a, Value::Text((*name).into()));
        values.insert(b, Value::Number(*n));
        values.insert(c, Value::Text((*color).into()));
    }
    (cell_map, values)
}

// ---- IF / IFS 家族：条件区与值区是两档规则 ----

/// `A1:A4 = 1, 5, 9, #DIV/0!`；`B1:B4 = #DIV/0!, 20, 30, 40`。
///
/// 两个错误格摆在**位置相反**的行：`A4` 落在条件区且不满足 `">3"`，`B1`
/// 落在值区且它那行的条件 `"<5"` 是**满足**的。一份夹具同时喂两条方向
/// 相反的规则，任何一侧「一律短路」或「一律吞掉」都会被抓住。
pub(super) fn make_criteria_error_env() -> (HashMap<CellAddress, AtomId>, HashMap<AtomId, Value>) {
    let col_a = [
        Value::Number(1.0),
        Value::Number(5.0),
        Value::Number(9.0),
        Value::Error(ValueError::DivisionByZero),
    ];
    let col_b = [
        Value::Error(ValueError::DivisionByZero),
        Value::Number(20.0),
        Value::Number(30.0),
        Value::Number(40.0),
    ];
    let mut cell_map = HashMap::new();
    let mut values = HashMap::new();
    for (row, (a, b)) in col_a.into_iter().zip(col_b).enumerate() {
        let a_id = AtomId::from_raw(row as u64 * 2);
        let b_id = AtomId::from_raw(row as u64 * 2 + 1);
        cell_map.insert(CellAddress::new(row as u32, 0), a_id);
        cell_map.insert(CellAddress::new(row as u32, 1), b_id);
        values.insert(a_id, a);
        values.insert(b_id, b);
    }
    (cell_map, values)
}
