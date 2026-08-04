//! 区域公式把反向依赖记在 Store 的哪种边上。
//!
//! 拆自 `sheet.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;

#[test]
fn small_range_formula_does_not_materialize_geometry_root() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(1.0));
    sheet.set_formula("B1", "=SUM(A1:A2)");

    assert_eq!(
        sheet.debug_range_dep_count(),
        0,
        "small range geometry stays lazy until the formula is read"
    );
    assert_eq!(sheet.get_cell("B1"), Value::Number(1.0));
    assert_eq!(
        sheet.debug_range_dep_count(),
        0,
        "Tier-A ranges depend on member facades instead of a geometry root"
    );

    sheet.set_cell("A2", Value::Number(2.0));
    assert_eq!(sheet.get_cell("B1"), Value::Number(3.0));
}

#[test]
fn small_range_formula_records_store_edge_on_empty_member_facade() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(1.0));
    sheet.set_formula("B1", "=SUM(A1:A2)");

    assert_eq!(sheet.get_cell("B1"), Value::Number(1.0));

    let a2 = CellAddress::parse("A2").unwrap();
    let a2_facade = sheet
        .cell_facade_family
        .borrow()
        .get(&a2)
        .expect("Tier-A range read materializes empty member facade");
    assert_eq!(
        sheet.store.debug_dependent_count(a2_facade),
        1,
        "formula-inner must depend on the empty member facade through Store"
    );

    let evals_before = sheet.debug_formula_eval_count();
    let visits_before = sheet.debug_reverse_dep_visit_count();
    sheet.set_cell("A2", Value::Number(2.0));

    assert_eq!(
        sheet.debug_reverse_dep_visit_count() - visits_before,
        1,
        "Store reverse reachability should find exactly this formula"
    );
    assert_eq!(sheet.get_cell("B1"), Value::Number(3.0));
    assert_eq!(sheet.debug_formula_eval_count(), evals_before + 1);
}

#[test]
fn large_range_formula_records_store_edge_on_band_epoch() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(1.0));
    sheet.set_formula("B1", "=SUM(A1:A300)");

    assert_eq!(sheet.get_cell("B1"), Value::Number(1.0));

    let band_key = RangeBandKey {
        col: 0,
        row_band: 1,
    };
    let band_epoch = sheet
        .range_band_epoch_family
        .borrow()
        .get(&band_key)
        .expect("large range read materializes the touched row-band epoch");
    assert_eq!(
        sheet.store.debug_dependent_count(band_epoch),
        1,
        "formula-inner must depend on the range band epoch through Store"
    );

    let a300 = CellAddress::parse("A300").unwrap();
    assert!(
        sheet.cell_facade_family.borrow().get(&a300).is_none(),
        "Tier-B range read should not materialize every empty member facade"
    );

    let evals_before = sheet.debug_formula_eval_count();
    let visits_before = sheet.debug_reverse_dep_visit_count();
    sheet.set_cell("A300", Value::Number(2.0));

    assert_eq!(
        sheet.debug_reverse_dep_visit_count() - visits_before,
        1,
        "the band root should reach exactly this formula through Store"
    );
    assert_eq!(sheet.get_cell("B1"), Value::Number(3.0));
    assert_eq!(sheet.debug_formula_eval_count(), evals_before + 1);
}

// === Phase 1 Track A — P0 bug: range dep survives sparse eval ===
//
// The sparse value iterator only visits non-empty addresses. The Store
// dependency layer must still represent empty range members: Tier A via
// member facades and Tier B via geometry roots. Otherwise writing A50
// after the first read would leave B1 stale.
#[test]
fn range_dep_survives_sparse_eval() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(1.0));
    sheet.set_cell("A100", Value::Number(2.0));
    sheet.set_formula("B1", "=SUM(A1:A100)");
    assert_eq!(sheet.get_cell("B1"), Value::Number(3.0));
    // A50 was empty during the first sparse eval. Writing it must
    // still dirty B1 — range deps mustn't be collapsed to "visited
    // cells only".
    sheet.set_cell("A50", Value::Number(10.0));
    assert_eq!(sheet.get_cell("B1"), Value::Number(13.0));
}

/// A 5000-row, one-column range maps to 20 lazy row-band roots. Writes
/// touch one root in O(1), and the Store owns the root-to-formula edge.
#[test]
fn large_range_uses_band_geometry_roots() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(1.0));
    sheet.set_cell("A5000", Value::Number(2.0));
    sheet.set_formula("B1", "=SUM(A1:A5000)");
    assert_eq!(sheet.get_cell("B1"), Value::Number(3.0));

    sheet.set_cell("A2500", Value::Number(10.0));
    assert_eq!(sheet.get_cell("B1"), Value::Number(13.0));

    assert_eq!(sheet.debug_range_dep_count(), 20);
    assert_eq!(sheet.debug_range_dep_candidates("A2500"), 1);
    assert_eq!(sheet.debug_range_dep_candidates("Z1"), 0);
}

/// Tier-A ranges install direct member-facade edges. No sheet-local
/// address-to-formula range index is involved.
#[test]
fn small_range_reverse_edges_are_store_facades() {
    let mut sheet = Sheet::new();
    const N: u32 = 1000;
    for i in 0..N {
        let formula = format!("=SUM(A{}:A{})", i + 1, i + 3);
        let target = format!("C{}", i + 1);
        sheet.set_formula(&target, &formula);
        let _ = sheet.get_cell(&target);
    }

    assert_eq!(sheet.debug_range_dep_count(), 0);
    assert_eq!(sheet.debug_range_dep_candidates("A501"), 0);
    assert_eq!(sheet.debug_dependents_count("A501"), 3);
}
