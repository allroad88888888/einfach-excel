//! Workbook basics tests.

use std::cell::RefCell;
use std::rc::Rc;

use super::*;
use einfach_core::ValueError;

#[test]
fn default_workbook_has_sheet1() {
    let wb = Workbook::new();
    assert_eq!(wb.sheet_count(), 1);
    assert_eq!(wb.name(0), Some("Sheet1"));
}

/// `WorkbookEvalProvider::current_cell()` round-trips whatever
/// `set_current_cell` was last called with. The `Sheet` eval loop drives
/// this via a save/restore guard around each formula's eval call so
/// `ROW()` / `COLUMN()` can read the formula's own address.
#[test]
fn workbook_provider_current_cell_round_trip() {
    let wb = Workbook::new();
    let provider = WorkbookEvalProvider {
        wb: &wb,
        current: Cell::new(0),
        current_cell: Cell::new(None),
    };
    assert_eq!(provider.current_cell(), None);
    let addr = CellAddress::new(2, 1); // B3 in 0-indexed (row=2, col=1)
    provider.set_current_cell(Some(addr));
    assert_eq!(provider.current_cell(), Some(addr));
    provider.set_current_cell(None);
    assert_eq!(provider.current_cell(), None);
}

#[test]
fn add_named_sheet() {
    let mut wb = Workbook::new();
    let idx = wb.add_sheet("Data");
    assert_eq!(idx, 1);
    assert_eq!(wb.index_of("Data"), Some(1));
}

#[test]
fn sparse_range_read_uses_workbook_provider_for_formulas() {
    let mut wb = Workbook::new();
    let data_idx = wb.add_sheet("Data");
    wb.set_cell(data_idx, "A1", Value::Number(41.0));
    assert!(wb.set_formula(0, "B1", "=Data!A1+1"));

    let mut got = Vec::new();
    wb.for_each_sparse_range_cell(
        0,
        CellRange::new(CellAddress::new(0, 0), CellAddress::new(0, 2)),
        |addr, value| got.push((addr.to_string(), value)),
    );

    assert_eq!(got, vec![("B1".to_string(), Value::Number(42.0))]);
}

#[test]
fn clear_range_scans_sparse_and_rederives_cross_sheet_dependents() {
    let mut wb = Workbook::new();
    let data_idx = wb.add_sheet("Data");
    wb.set_cell(data_idx, "A1", Value::Number(41.0));
    wb.set_cell(data_idx, "C3", Value::Number(99.0));
    assert!(wb.set_formula(0, "B1", "=Data!A1+1"));

    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(42.0));
    assert_eq!(wb.debug_formula_cache_state(0, "B1"), "clean");
    let before = wb.debug_formula_eval_count(0);

    let cleared = wb.clear_range(
        data_idx,
        CellRange::new(CellAddress::new(0, 0), CellAddress::new(1, 1)),
    );

    assert_eq!(cleared, 1);
    assert_eq!(wb.debug_formula_cache_state(0, "B1"), "clean");
    assert_eq!(wb.debug_formula_eval_count(0), before + 1);
    assert_eq!(wb.sheet(data_idx).unwrap().non_empty_addrs(), vec!["C3"]);
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(1.0));
}

#[test]
fn add_existing_returns_existing_index() {
    let mut wb = Workbook::new();
    let a = wb.add_sheet("X");
    let b = wb.add_sheet("X");
    assert_eq!(a, b);
    assert_eq!(wb.sheet_count(), 2); // Sheet1 + X
}

#[test]
fn rename_updates_lookup() {
    let mut wb = Workbook::new();
    wb.add_sheet("Old");
    assert!(wb.rename_sheet(1, "New"));
    assert_eq!(wb.index_of("Old"), None);
    assert_eq!(wb.index_of("New"), Some(1));
}

#[test]
fn rename_to_taken_fails() {
    let mut wb = Workbook::new();
    wb.add_sheet("A");
    wb.add_sheet("B");
    assert!(!wb.rename_sheet(2, "A"));
}

#[test]
fn cross_sheet_read_resolves_through_workbook() {
    let mut wb = Workbook::new();
    wb.add_sheet("Data");
    // Sheet1 = wb.sheet_mut(0)
    wb.sheet_mut(0).unwrap().set_cell("A1", Value::Number(10.0));
    wb.sheet_by_name_mut("Data")
        .unwrap()
        .set_cell("A1", Value::Number(99.0));

    // Cross-sheet read via Workbook
    assert_eq!(wb.get_cell("Data", "A1"), Value::Number(99.0));
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(10.0));
    // Unknown sheet → Null
    assert_eq!(wb.get_cell("Nope", "A1"), Value::Null);
}

#[test]
fn cross_sheet_formula_evaluates() {
    let mut wb = Workbook::new();
    wb.add_sheet("Data");
    wb.sheet_by_name_mut("Data")
        .unwrap()
        .set_cell("A1", Value::Number(50.0));
    // Sheet1!B1 = =Data!A1 * 2. Both sheets share one workbook Store,
    // so the formula-inner atom reads Data!A1 through its target facade.
    assert!(wb.set_formula(0, "B1", "=Data!A1*2"));

    // wb.get_cell evaluates through WorkbookEvalProvider.
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(100.0));

    // Updating the cross-sheet source and re-reading should see the
    // new value (no manual invalidation step needed).
    wb.sheet_by_name_mut("Data")
        .unwrap()
        .set_cell("A1", Value::Number(7.0));
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(14.0));
}

#[test]
fn current_sheet_qualified_ref_resolves_like_same_sheet_ref() {
    let mut wb = Workbook::new();
    wb.add_sheet("Data");
    wb.sheet_mut(0).unwrap().set_cell("A1", Value::Number(3.0));
    wb.sheet_by_name_mut("Data")
        .unwrap()
        .set_cell("A1", Value::Number(7.0));
    wb.sheet_mut(0)
        .unwrap()
        .set_formula("B1", "=Sheet1!A1+Data!A1");

    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(10.0));
}

#[test]
fn current_sheet_qualified_self_ref_returns_cycle_error() {
    let mut wb = Workbook::new();
    wb.sheet_mut(0).unwrap().set_formula("A1", "=Sheet1!A1");

    assert_eq!(
        wb.get_cell("Sheet1", "A1"),
        Value::Error(ValueError::CyclicRef)
    );
}

#[test]
fn workbook_get_cell_refreshes_cross_sheet_cache_without_notifying() {
    let mut wb = Workbook::new();
    wb.add_sheet("Data");
    wb.sheet_by_name_mut("Data")
        .unwrap()
        .set_cell("A1", Value::Number(5.0));
    wb.sheet_mut(0).unwrap().set_formula("B1", "=Data!A1*2");

    let changes = Rc::new(RefCell::new(0u32));
    let changes_clone = changes.clone();
    wb.sheet_mut(0).unwrap().subscribe_cell("B1", move || {
        *changes_clone.borrow_mut() += 1;
    });

    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(10.0));
    assert_eq!(*changes.borrow(), 0);
}

#[test]
fn workbook_get_cell_materializes_only_target_atom_chain() {
    // Build a sheet with two independent cross-sheet formula chains:
    //   B1 = =Data!A1 * 2   (chain A — what we'll read)
    //   D1 = =Data!A1 + 1   (chain B — must NOT be touched by reading B1)
    //   E1 = =Data!A1 + 5   (chain B continued)
    // Reading B1 should materialize only its Store dependency chain.
    let mut wb = Workbook::new();
    wb.add_sheet("Data");
    wb.sheet_by_name_mut("Data")
        .unwrap()
        .set_cell("A1", Value::Number(10.0));
    wb.sheet_mut(0).unwrap().set_formula("B1", "=Data!A1*2");
    wb.sheet_mut(0).unwrap().set_formula("D1", "=Data!A1+1");
    wb.sheet_mut(0).unwrap().set_formula("E1", "=Data!A1+5");

    let before = wb.sheet(0).unwrap().debug_recompute_count();
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(20.0));
    let after = wb.sheet(0).unwrap().debug_recompute_count();

    assert_eq!(
        after - before,
        3,
        "reading B1 should materialize formula-inner, facade, and source facade atoms"
    );
    assert_eq!(wb.debug_formula_eval_count(0), 1);
    assert_eq!(wb.debug_formula_cache_state(0, "B1"), "clean");
    assert_eq!(wb.debug_formula_cache_state(0, "D1"), "dirty");
    assert_eq!(wb.debug_formula_cache_state(0, "E1"), "dirty");
}

#[test]
fn workbook_get_cell_walks_local_dep_chain_to_cross_sheet() {
    // C1 = =B1 + 100  (no SheetRef directly)
    // B1 = =Data!A1 * 2  (cross-sheet)
    // Reading C1 materializes its local B1 dependency, whose formula-inner
    // atom then reads Data!A1 from the same workbook Store.
    let mut wb = Workbook::new();
    wb.add_sheet("Data");
    wb.sheet_by_name_mut("Data")
        .unwrap()
        .set_cell("A1", Value::Number(3.0));
    assert!(wb.set_formula(0, "B1", "=Data!A1*2"));
    assert!(wb.set_formula(0, "C1", "=B1+100"));

    // Initial read: B1 should resolve to 6, C1 to 106.
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(106.0));

    // Mutating Data!A1 synchronously rederives the materialized chain.
    wb.sheet_by_name_mut("Data")
        .unwrap()
        .set_cell("A1", Value::Number(4.0));
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(108.0));
}

#[test]
fn workbook_get_cell_no_cross_sheet_chain_uses_store_recompute_path() {
    // Reading a same-sheet-only formula through the workbook should stay
    // on the atomm facade/formula-inner path. The first read therefore
    // records Store recomputes (facade/inner/source facade) without a
    // workbook-provider override.
    let mut wb = Workbook::new();
    wb.sheet_mut(0).unwrap().set_cell("A1", Value::Number(7.0));
    wb.sheet_mut(0).unwrap().set_formula("B1", "=A1*2");

    let before = wb.sheet(0).unwrap().debug_recompute_count();
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(14.0));
    let after = wb.sheet(0).unwrap().debug_recompute_count();
    assert_eq!(
        after - before,
        3,
        "same-sheet workbook read must stay on the atomm Store path"
    );
}

#[test]
fn same_sheet_formula_unaffected_by_workbook_get() {
    // Same-sheet formulas use the same facade/formula-inner Store path.
    let mut wb = Workbook::new();
    wb.sheet_mut(0).unwrap().set_cell("A1", Value::Number(3.0));
    wb.sheet_mut(0).unwrap().set_formula("B1", "=A1*4");
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(12.0));
}
