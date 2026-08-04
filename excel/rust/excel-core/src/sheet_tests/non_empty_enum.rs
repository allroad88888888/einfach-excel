//! 非空单元格枚举的口径与遍历代价。
//!
//! 拆自 `sheet.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;

#[test]
fn non_empty_addrs_skips_empties_and_unions_kinds() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(1.0));
    sheet.set_cell("B2", Value::Text("hi".into()));
    sheet.set_formula("C3", "=A1+1");
    // D4 left untouched — must NOT appear.
    let mut got = sheet.non_empty_addrs();
    got.sort();
    assert_eq!(got, vec!["A1", "B2", "C3"]);
}

#[test]
fn non_empty_addrs_dedups_primitive_under_formula() {
    // When the same address holds a formula, it must not appear twice
    // even if a stale primitive slot was created before the upgrade.
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(99.0));
    sheet.set_formula("A1", "=2+2");
    let got = sheet.non_empty_addrs();
    assert_eq!(got, vec!["A1"]);
}

#[test]
fn non_empty_addrs_drops_cleared() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(1.0));
    sheet.set_cell("B1", Value::Number(2.0));
    sheet.clear_cell("A1");
    let got = sheet.non_empty_addrs();
    assert_eq!(got, vec!["B1"]);
}

#[test]
fn non_empty_enumeration_hides_cleared_atom_retained_by_formula_dependency() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(1.0));
    sheet.set_formula("B1", "=A1+1");
    assert_eq!(sheet.get_cell("B1"), Value::Number(2.0));

    sheet.clear_cell("A1");

    let mut all = sheet.non_empty_addrs();
    all.sort();
    assert_eq!(all, vec!["B1"]);

    let range = CellRange::new(CellAddress::new(0, 0), CellAddress::new(0, 0));
    let mut in_range = Vec::new();
    sheet.for_each_non_empty_in_range(range, |addr| in_range.push(addr.to_string()));
    assert!(in_range.is_empty());
}

#[test]
fn non_empty_in_range_skips_holes_and_does_not_eval_formulas() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(1.0));
    sheet.set_cell("C3", Value::Number(3.0));
    sheet.set_formula("B2", "=A1+1");

    let range = CellRange::new(CellAddress::new(0, 0), CellAddress::new(1, 1));
    let mut got = Vec::new();
    sheet.for_each_non_empty_in_range(range, |addr| got.push(addr.to_string()));

    got.sort();
    assert_eq!(got, vec!["A1", "B2"]);
    assert_eq!(sheet.debug_formula_cache_state("B2"), "dirty");
}

#[test]
fn clear_range_clears_sparse_hits_and_dirties_dependents() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(1.0));
    sheet.set_cell("C3", Value::Number(3.0));
    sheet.set_formula("D1", "=A1+1");
    assert_eq!(sheet.get_cell("D1"), Value::Number(2.0));
    assert_eq!(sheet.debug_formula_cache_state("D1"), "clean");

    let range = CellRange::new(CellAddress::new(0, 0), CellAddress::new(1, 1));
    assert_eq!(sheet.clear_range(range), 1);

    assert_eq!(sheet.get_cell("A1"), Value::Null);
    assert_eq!(sheet.get_cell("C3"), Value::Number(3.0));
    assert_eq!(sheet.debug_formula_cache_state("D1"), "clean");
    assert_eq!(sheet.get_cell("D1"), Value::Number(1.0));
}

// === Phase 2 Track F — sparse range read visits O(matches) ===

/// Scatter 1000 cells across 10000 rows (one cell per even-decade
/// row), then read a 51-row band. The callback must fire only for
/// the cells inside the band, not for the full 1000 — the whole
/// point of switching `cells` to a row-major BTreeMap is that
/// `for_each_sparse_cell_with` does `BTreeMap::range`, not a
/// `filter` sweep over every non-empty entry.
#[test]
fn for_each_range_cell_visits_only_overlap() {
    let mut sheet = Sheet::new();

    // Seed 1000 cells at rows {1, 11, 21, ..., 9991} in column A
    // (col index 0, row index = 10*k for k in 0..1000 ⇒ row 0,
    // 10, 20, ..., 9990 in zero-based ⇒ "A1", "A11", "A21", ...,
    // "A9991" in 1-based labels). Using row stride 10 makes the
    // expected hit count for the target band exact and obvious.
    let mut seeded = Vec::with_capacity(1000);
    for k in 0..1000u32 {
        let row = k * 10; // 0-based row index
        let addr = CellAddress::new(row, 0); // column A
        sheet.set_cell(&addr.to_string_repr(), Value::Number(k as f64));
        seeded.push(addr);
    }
    assert_eq!(sheet.debug_primitive_atom_count(), 1000);

    // Target band: 1-based rows 50..=100 ⇒ 0-based rows 49..=99.
    // Seeded rows inside this band: 50, 60, 70, 80, 90 ⇒ 5 hits.
    let range = CellRange::new(CellAddress::new(49, 0), CellAddress::new(99, 0));

    let mut visited: Vec<CellAddress> = Vec::new();
    sheet.for_each_sparse_cell_with(range, &|s, addr| s.peek_value(addr), &mut |addr, _v| {
        visited.push(addr)
    });

    // Exactly the band cells, nothing else.
    let expected: Vec<CellAddress> = seeded
        .iter()
        .copied()
        .filter(|a| range.contains(*a))
        .collect();
    assert_eq!(
        visited,
        expected,
        "for_each_range_cell must visit ONLY cells inside the range \
         (got {} visits for a band overlapping {} seeded cells out of 1000 total)",
        visited.len(),
        expected.len()
    );
    assert_eq!(
        visited.len(),
        5,
        "expected 5 hits at rows 50, 60, 70, 80, 90 — got {}",
        visited.len()
    );
    // Most importantly: NOT 1000. The whole acceptance contract
    // of Track F is that range reads do not pay an O(N) cost.
    assert!(
        visited.len() < 1000,
        "range read scanned the full sheet ({} visits) — \
         RowMajorMap::range_iter not actually scoping the walk",
        visited.len()
    );
}
