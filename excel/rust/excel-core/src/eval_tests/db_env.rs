//! 数据库函数家族共用的表头加数据行夹具。
//!
//! 拆自 `eval.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;

// === Database functions (D*) ===
//
// Layout used by `make_db_env`:
//
//   A1:D1  =  "Name",  "Age", "Dept",  "Salary"   (header row)
//   A2:D2  =  "Alice",  30,   "Eng",   80000
//   A3:D3  =  "Bob",    25,   "Sales", 60000
//   A4:D4  =  "Carol",  35,   "Eng",   95000
//   A5:D5  =  "Dave",   28,   "Sales", 70000
//
//   F1:G1  =  "Dept",   "Age"                       (criteria header)
//   F2:G2  =  "Eng",    ">28"                       (criterion row 1)
//
// So the default criteria (F1:G2) matches Alice (Eng, 30) and Carol
// (Eng, 35). Bob/Dave fail Dept; Alice/Carol pass both Dept and Age.
pub(super) fn make_db_env() -> (HashMap<CellAddress, AtomId>, HashMap<AtomId, Value>) {
    let mut cell_map = HashMap::new();
    let mut values = HashMap::new();

    // Helper: insert a labelled (row, col) cell with a fresh AtomId.
    let mut next_id: u64 = 0;
    let mut put = |cm: &mut HashMap<CellAddress, AtomId>,
                   vs: &mut HashMap<AtomId, Value>,
                   row: u32,
                   col: u32,
                   v: Value| {
        let id = AtomId::from_raw(next_id);
        next_id += 1;
        cm.insert(CellAddress::new(row, col), id);
        vs.insert(id, v);
    };

    // Database header.
    put(&mut cell_map, &mut values, 0, 0, Value::Text("Name".into()));
    put(&mut cell_map, &mut values, 0, 1, Value::Text("Age".into()));
    put(&mut cell_map, &mut values, 0, 2, Value::Text("Dept".into()));
    put(
        &mut cell_map,
        &mut values,
        0,
        3,
        Value::Text("Salary".into()),
    );

    // Database rows.
    let rows: [(&str, f64, &str, f64); 4] = [
        ("Alice", 30.0, "Eng", 80000.0),
        ("Bob", 25.0, "Sales", 60000.0),
        ("Carol", 35.0, "Eng", 95000.0),
        ("Dave", 28.0, "Sales", 70000.0),
    ];
    for (i, (name, age, dept, salary)) in rows.iter().enumerate() {
        let r = (i + 1) as u32;
        put(
            &mut cell_map,
            &mut values,
            r,
            0,
            Value::Text((*name).into()),
        );
        put(&mut cell_map, &mut values, r, 1, Value::Number(*age));
        put(
            &mut cell_map,
            &mut values,
            r,
            2,
            Value::Text((*dept).into()),
        );
        put(&mut cell_map, &mut values, r, 3, Value::Number(*salary));
    }

    // Criteria region (F1:G2) — Dept="Eng" AND Age>28.
    put(&mut cell_map, &mut values, 0, 5, Value::Text("Dept".into()));
    put(&mut cell_map, &mut values, 0, 6, Value::Text("Age".into()));
    put(&mut cell_map, &mut values, 1, 5, Value::Text("Eng".into()));
    put(&mut cell_map, &mut values, 1, 6, Value::Text(">28".into()));

    (cell_map, values)
}
