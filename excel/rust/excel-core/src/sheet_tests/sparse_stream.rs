//! 稀疏区域按流式喂给聚合函数求值。
//!
//! 拆自 `sheet.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;

// === LAZY Step 4: SheetEvalProvider sparse range streaming ===

#[test]
fn sum_full_column_walks_sparse() {
    // Two real cells in a column with huge nominal extent. The
    // SheetEvalProvider sparse override drives `SUM(A1:A100000)` to
    // visit only the two real addresses, not 100_000.
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(5.0));
    sheet.set_cell("A100000", Value::Number(10.0));

    let before_atoms = sheet.debug_primitive_atom_count();
    sheet.set_formula("B1", "=SUM(A1:A100000)");
    let v = sheet.get_cell("B1");
    let after_atoms = sheet.debug_primitive_atom_count();

    assert_eq!(v, Value::Number(15.0));
    // The two original primitive cells; SUM didn't create a third.
    assert_eq!(before_atoms, 2);
    assert_eq!(after_atoms, 2);
}

#[test]
fn sum_stateless_no_atoms_materialized() {
    // 5 primitive cells across a huge range. SUM doesn't grow the
    // primitive atom count — no temp Vec, no atom-per-empty-cell.
    let mut sheet = Sheet::new();
    for (addr, val) in [
        ("A1", 1.0),
        ("A10", 2.0),
        ("A100", 3.0),
        ("A1000", 4.0),
        ("A10000", 5.0),
    ] {
        sheet.set_cell(addr, Value::Number(val));
    }
    let before = sheet.debug_primitive_atom_count();
    assert_eq!(before, 5);

    sheet.set_formula("B1", "=SUM(A1:A100000)");
    let v = sheet.get_cell("B1");
    assert_eq!(v, Value::Number(15.0));

    let after = sheet.debug_primitive_atom_count();
    assert_eq!(
        after, before,
        "SUM(huge range) must not materialize cell atoms (before={}, after={})",
        before, after
    );
}

#[test]
fn median_stateful_still_works_via_sheet_provider() {
    // MEDIAN keeps its temp Vec but routes through the sparse range
    // streaming path. A1..A5 = 1..5 → MEDIAN = 3. No atoms beyond
    // the 5 primitives we set.
    let mut sheet = Sheet::new();
    for (i, n) in [1.0, 2.0, 3.0, 4.0, 5.0].iter().enumerate() {
        sheet.set_cell(&format!("A{}", i + 1), Value::Number(*n));
    }
    let before = sheet.debug_primitive_atom_count();
    sheet.set_formula("B1", "=MEDIAN(A1:A5)");
    let v = sheet.get_cell("B1");
    let after = sheet.debug_primitive_atom_count();

    assert_eq!(v, Value::Number(3.0));
    assert_eq!(after, before, "MEDIAN must not materialize cell atoms");
}

#[test]
fn average_streaming_matches_eager_via_sheet_provider() {
    // Random-ish integer values + an empty hole. AVERAGE should
    // match (sum / count) of only the real numeric cells; the hole
    // is skipped, no atom created.
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(10.0));
    sheet.set_cell("A2", Value::Number(20.0));
    // A3 left empty intentionally
    sheet.set_cell("A4", Value::Number(40.0));
    sheet.set_cell("A5", Value::Number(50.0));

    let before = sheet.debug_primitive_atom_count();
    sheet.set_formula("B1", "=AVERAGE(A1:A5)");
    let v = sheet.get_cell("B1");
    let after = sheet.debug_primitive_atom_count();

    // Expected: AVERAGE skips Null (empty cell). Sum=120, count=4.
    assert_eq!(v, Value::Number(30.0));
    assert_eq!(after, before, "AVERAGE must not materialize cell atoms");
}

#[test]
fn count_range_with_holes_via_sheet_provider() {
    // A1=1, A3=2, A5=3 — A2/A4 empty. COUNT(A1:A5) = 3 (Excel's
    // contract: numeric values only, holes skipped).
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(1.0));
    sheet.set_cell("A3", Value::Number(2.0));
    sheet.set_cell("A5", Value::Number(3.0));

    sheet.set_formula("B1", "=COUNT(A1:A5)");
    assert_eq!(sheet.get_cell("B1"), Value::Number(3.0));
}
