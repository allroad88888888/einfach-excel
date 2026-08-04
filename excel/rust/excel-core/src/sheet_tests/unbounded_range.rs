//! 整列 / 整行区域的求值与脏传播。
//!
//! 拆自 `sheet.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;

// === Phase 2 Track G — whole-col / whole-row eval ===

/// `=SUM(A:A)` evaluates the entire column A, picking up cells
/// regardless of how far down they sit. The sheet has 4 real cells
/// in column A — including one in row 1,000,000 — and one cell in
/// column B that must NOT contribute. Sum is exactly 10.
#[test]
fn sum_whole_col_evaluates_against_all_rows() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(1.0));
    sheet.set_cell("A2", Value::Number(2.0));
    sheet.set_cell("A3", Value::Number(3.0));
    // 1-based row 1,000,000 → 0-based 999,999. Far above the
    // bounded `A1:A1048576` extent; trivially confirms the
    // unbounded path doesn't clamp early.
    sheet.set_cell("A1000000", Value::Number(4.0));
    sheet.set_cell("B1", Value::Number(99.0)); // not in column A

    let before = sheet.debug_primitive_atom_count();
    sheet.set_formula("C1", "=SUM(A:A)");
    let v = sheet.get_cell("C1");
    let after = sheet.debug_primitive_atom_count();

    assert_eq!(v, Value::Number(10.0));
    // No atoms materialized for empty rows between A3 and A1000000.
    // before is 5 (A1, A2, A3, A1000000, B1); SUM(A:A) must not
    // grow it.
    assert_eq!(
        after, before,
        "SUM(A:A) must not materialize empty-cell atoms in the 1M-row \
         coordinate space (before={}, after={})",
        before, after
    );
}

/// `=SUM(1:1)` sums row 1 across columns. Same lazy contract.
/// Important: the formula cell must NOT live in row 1 — otherwise
/// it self-references and eval correctly returns CyclicRef.
#[test]
fn sum_whole_row_evaluates_across_cols() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(1.0));
    sheet.set_cell("B1", Value::Number(2.0));
    sheet.set_cell("C1", Value::Number(3.0));
    sheet.set_cell("A2", Value::Number(99.0)); // not in row 1

    let before = sheet.debug_primitive_atom_count();
    // Park the formula on row 2 (out of the SUM range) so we test
    // the row-1 sum, not the self-cycle on row 1.
    sheet.set_formula("D2", "=SUM(1:1)");
    let v = sheet.get_cell("D2");
    let after = sheet.debug_primitive_atom_count();

    assert_eq!(v, Value::Number(6.0));
    assert_eq!(after, before, "SUM(1:1) must not materialize atoms");
}

/// `=SUM(A:C)` covers columns A through C, every row.
#[test]
fn sum_multi_col_range() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(1.0));
    sheet.set_cell("B1", Value::Number(2.0));
    sheet.set_cell("C1", Value::Number(3.0));
    sheet.set_cell("D1", Value::Number(99.0)); // not in A:C
    sheet.set_cell("A100", Value::Number(10.0));
    sheet.set_cell("C500", Value::Number(20.0));

    sheet.set_formula("E1", "=SUM(A:C)");
    assert_eq!(sheet.get_cell("E1"), Value::Number(36.0));
}

/// Equivalence: `=SUM(A1:A1048576)` and `=SUM(A:A)` must compute
/// the same total over the same seeded cells, AND both must keep
/// the primitive atom count bounded by the actual non-empty cells.
#[test]
fn whole_col_matches_explicit_bounded_form() {
    let mut sheet = Sheet::new();
    for (i, n) in [1.0, 2.0, 3.0, 4.0, 5.0].iter().enumerate() {
        sheet.set_cell(&format!("A{}", (i + 1) * 100), Value::Number(*n));
    }
    let before = sheet.debug_primitive_atom_count();
    assert_eq!(before, 5);

    sheet.set_formula("B1", "=SUM(A1:A1048576)");
    let bounded = sheet.get_cell("B1");

    sheet.set_formula("C1", "=SUM(A:A)");
    let unbounded = sheet.get_cell("C1");

    let after = sheet.debug_primitive_atom_count();

    assert_eq!(bounded, Value::Number(15.0));
    assert_eq!(unbounded, Value::Number(15.0));
    assert_eq!(bounded, unbounded);
    assert_eq!(
        after, before,
        "neither =SUM(A1:A1048576) nor =SUM(A:A) should materialize \
         cell atoms outside the 5 seeded ones (before={}, after={})",
        before, after
    );
}

/// Writes deep inside an unbounded range still dirty the dependent
/// formula — Track E routes wide ranges (including unbounded) to
/// `wide_ranges`, which is linearly scanned on every write.
#[test]
fn whole_col_dirty_propagation() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(1.0));
    sheet.set_cell("A2", Value::Number(2.0));
    sheet.set_formula("B1", "=SUM(A:A)");
    assert_eq!(sheet.get_cell("B1"), Value::Number(3.0));

    // Write to A1_000_000 (row 999,999, col 0). Range registration
    // sent this whole-col into wide_ranges (rows > 4096), so the
    // dirty-write path consults wide_ranges and re-evaluates B1.
    sheet.set_cell("A1000000", Value::Number(100.0));
    assert_eq!(sheet.get_cell("B1"), Value::Number(103.0));
}
