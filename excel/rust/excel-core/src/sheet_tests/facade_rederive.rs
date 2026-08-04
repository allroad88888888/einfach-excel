//! 门面原子经 Store 依赖边重新求导的路径。
//!
//! 拆自 `sheet.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use einfach_core::ValueError;

// === P4c: write口 → facade re-derivation (Commit A) ===
//
// These pin the write口 helpers wired this phase (`bump_facade_epoch`,
// `invalidate_formula_inner`) against a MANUALLY materialized facade —
// the read entry points don't consult the facade yet (that flip is
// Commit B), so in production the facade families stay empty and these
// helpers are inert. We materialize a facade by hand via `facade_of`,
// subscribe on it, drive a REAL write口, and assert the facade re-derives
// to the correct VALUE and the subscriber fired. We assert `>= 1`
// notifications, never an exact count: over-bumping is safe by design
// (the facade re-derives to the same value and change-pruning suppresses a
// spurious notify), so an exact count would be a brittle over-specification.

#[test]
fn facade_redrives_on_formula_content_edit() {
    // The load-bearing case for `invalidate_formula_inner` + bump: a
    // formula-content edit (`=B1`→`=C1`) whose upstream deps are unchanged.
    // Without the invalidate the inner atom's recorded edge ({B1}) is still
    // fresh and the facade would read the CACHED old-AST value (5), never
    // re-resolving to `=C1` (9).
    let mut sheet = Sheet::new();
    sheet.set_cell("B1", Value::Number(5.0));
    sheet.set_cell("C1", Value::Number(9.0));
    sheet.set_formula("A1", "=B1");

    let addr = CellAddress::parse("A1").unwrap();
    let facade = sheet.facade_of(addr);
    let hits = Rc::new(Cell::new(0u32));
    let hits_l = hits.clone();
    sheet
        .store
        .sub(facade, move || hits_l.set(hits_l.get() + 1));

    assert_eq!(sheet.store.get(facade), Value::Number(5.0));

    sheet.set_formula("A1", "=C1");
    sheet.store.flush();

    assert_eq!(sheet.store.get(facade), Value::Number(9.0));
    assert!(hits.get() >= 1, "subscriber fired on content edit");
}

#[test]
fn facade_redrives_on_formula_upstream_change() {
    // The NATIVE-edge path: an upstream write bumps the dep atom's
    // generation, so the formula inner re-derives off its own recorded
    // edge and the facade re-derives off `args.get(inner)` — no epoch bump
    // needed (and none fires, because the inner-atom identity is unchanged).
    let mut sheet = Sheet::new();
    sheet.set_cell("B1", Value::Number(5.0));
    sheet.set_formula("A1", "=B1+1");

    let addr = CellAddress::parse("A1").unwrap();
    let facade = sheet.facade_of(addr);
    let hits = Rc::new(Cell::new(0u32));
    let hits_l = hits.clone();
    sheet
        .store
        .sub(facade, move || hits_l.set(hits_l.get() + 1));

    assert_eq!(sheet.store.get(facade), Value::Number(6.0));

    sheet.set_cell("B1", Value::Number(10.0));
    sheet.store.flush();

    assert_eq!(sheet.store.get(facade), Value::Number(11.0));
    assert!(hits.get() >= 1, "subscriber fired on upstream change");
}

#[test]
fn facade_redrives_on_literal_update() {
    // A same-id literal update propagates via the facade's native
    // `args.get(inner)` edge — `try_set_cell` reuses the Atom slot's id, so
    // `store.set(id, ..)` alone re-derives the facade with no epoch bump.
    let mut sheet = Sheet::new();
    sheet.set_cell("A1", Value::Number(1.0));

    let addr = CellAddress::parse("A1").unwrap();
    let facade = sheet.facade_of(addr);
    let hits = Rc::new(Cell::new(0u32));
    let hits_l = hits.clone();
    sheet
        .store
        .sub(facade, move || hits_l.set(hits_l.get() + 1));

    assert_eq!(sheet.store.get(facade), Value::Number(1.0));

    sheet.set_cell("A1", Value::Number(2.0));
    sheet.store.flush();

    assert_eq!(sheet.store.get(facade), Value::Number(2.0));
    assert!(hits.get() >= 1, "subscriber fired on literal update");
}

#[test]
fn facade_redrives_on_formula_to_literal_replacement() {
    // Identity transition: replacing a formula with a literal swaps the
    // facade's inner atom (formula-inner → primitive), so the epoch bump
    // (via `had_formula`) is what drives the re-derive.
    let mut sheet = Sheet::new();
    sheet.set_cell("B1", Value::Number(7.0));
    sheet.set_formula("A1", "=B1");

    let addr = CellAddress::parse("A1").unwrap();
    let facade = sheet.facade_of(addr);
    let hits = Rc::new(Cell::new(0u32));
    let hits_l = hits.clone();
    sheet
        .store
        .sub(facade, move || hits_l.set(hits_l.get() + 1));

    assert_eq!(sheet.store.get(facade), Value::Number(7.0));

    sheet.set_cell("A1", Value::Number(42.0));
    sheet.store.flush();

    assert_eq!(sheet.store.get(facade), Value::Number(42.0));
    assert!(hits.get() >= 1, "subscriber fired on formula→literal");
}

// P4c facade/formula-inner path (white-box). These pin that same-sheet
// formula values and re-derivation flow through Store derived-atom edges
// (`readAtom` + `dependenciesChange` parity), with no address-level
// dependency graph.

/// The facade for a formula cell delegates to its formula-inner atom,
/// which evaluates the AST via `AtomFormulaProvider` and reads referenced
/// cells' facades. First read of `A2 = A1 + 5` resolves to 15 purely
/// through store edges.
#[test]
fn facade_reads_formula_via_inner_atom() {
    let mut sheet = Sheet::new();
    // Materialize A1 so this white-box case can mutate its primitive atom
    // directly through Store.
    let a1_inner = sheet.cell_atom("A1");
    sheet.store.set(a1_inner, Value::Number(10.0));
    assert!(sheet.set_formula("A2", "=A1+5"));

    let a2 = CellAddress::parse("A2").unwrap();
    let facade_a2 = sheet.facade_of(a2);
    assert_eq!(sheet.store.get(facade_a2), Value::Number(15.0));
}

/// Editing an upstream cell's inner atom re-derives the dependent
/// formula's facade purely through store dependency edges (vanilla
/// `dependenciesChange` parity) — no parallel graph, no epoch bump. The
/// live chain is `a1_inner → facade(A1) → formula_inner(A2) → facade(A2)`.
#[test]
fn facade_rederives_on_upstream_store_write() {
    let mut sheet = Sheet::new();
    let a1_inner = sheet.cell_atom("A1");
    sheet.store.set(a1_inner, Value::Number(10.0));
    assert!(sheet.set_formula("A2", "=A1+5"));

    let a2 = CellAddress::parse("A2").unwrap();
    let facade_a2 = sheet.facade_of(a2);
    assert_eq!(sheet.store.get(facade_a2), Value::Number(15.0));

    // Bump the upstream atom's generation; the dependent facade re-derives
    // on the next read with no address-level bookkeeping.
    sheet.store.set(a1_inner, Value::Number(20.0));
    assert_eq!(sheet.store.get(facade_a2), Value::Number(25.0));
}

/// F1 runtime cycle guard: a self-referential formula installed PAST the
/// load-time static cycle check — here via the lazy `formula_source` /
/// `needs_parse` path that the static local cycle gate never
/// sees — must resolve to a sticky `#CYCLE!` through `InFlightGuard` /
/// `in_flight` re-entry detection, not unbounded recursion. The self-read
/// records a reverse edge via `ReadArgs::depend` (tolerates the computing
/// peer) so dissolving the cycle later re-invalidates the reader.
#[test]
fn facade_runtime_cycle_returns_sticky_cycle() {
    let sheet = Sheet::new();
    let a1 = CellAddress::parse("A1").unwrap();
    // Install `A1 = A1 + 1` directly as a lazy formula, bypassing the
    // load-time static cycle rejection that `set_formula` would apply.
    sheet
        .interior
        .formula_source
        .borrow_mut()
        .insert(a1, ParkedFormula::new("=A1+1"));
    sheet.interior.needs_parse.borrow_mut().insert(a1);

    let facade_a1 = sheet.facade_of(a1);
    assert_eq!(
        sheet.store.get(facade_a1),
        Value::Error(ValueError::CyclicRef)
    );
}
