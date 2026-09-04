//! 公式闭包共享的单元格与公式内部存储。

use super::*;

/// Shared interior cell/formula storage (P4a of the atom-delegation
/// rewrite — see `excel/rust/docs/ATOM_DELEGATION_REWRITE_PLAN.md`). Holds the
/// per-sheet state that formula read-closures will later (P4c) need to
/// reach from inside the store via a `Weak<SheetInterior>` capture, so
/// it lives behind an `Rc` on [`Sheet`] instead of as direct fields.
///
/// BORROW RULE (D7 corollary): no borrow of any field here may be held
/// across a `store.*` call, an `owned_*` wrapper, subscriber/listener
/// dispatch, or any `Sheet` method that might re-borrow the same field.
/// Pattern: borrow → copy out (clone the `Value` / copy the `AtomId` /
/// collect into a `Vec`) → release the guard → act.
pub(crate) struct SheetInterior {
    /// Primitive cell slots keyed by `(row, col)`. Backed by a row-major
    /// `RowMajorMap` so range reads (e.g. viewport, `SUM(A1:A100)`) scan
    /// O(cells_in_range) rather than the full non-empty set — the Phase 2
    /// Track F target from `PHASE2_PARALLEL.md`. API surface still mimics
    /// `HashMap` (`get`/`insert`/`remove`/`contains_key`/`len`/`keys`).
    ///
    /// AUDIT B-2: slots are either `Plain(Value)` (lazily atomized — the
    /// bulk-install fast path) or `Atom(AtomId)` (materialized). See
    /// [`CellSlot`] for the invariants.
    pub(crate) cells: RefCell<RowMajorMap<CellSlot>>,
    /// Formula structural records live at the Sheet layer. Hydrated same-sheet
    /// formula results are derived and cached by Store formula-inner atoms.
    /// Same row-major shape as `cells` keeps range scans over mixed
    /// primitive/formula cells O(matches).
    ///
    /// LAZY_FORMULA_INDEXING Phase 3: `RefCell` so `hydrate_formula(&self)`
    /// can install a freshly-parsed record without taking `&mut self`.
    /// Read paths consult the map via short `borrow()` snapshots that
    /// clone `Rc<FormulaRecord>` and release the borrow before any
    /// recursive eval (which might re-enter through another read /
    /// hydration). Iteration patterns snapshot keys first to avoid
    /// holding the borrow across a possible `borrow_mut`.
    pub(crate) formula_cells: RefCell<RowMajorMap<Rc<FormulaRecord>>>,
    /// AST of each formula cell, used for static cycle detection (B.2).
    ///
    /// LAZY_FORMULA_INDEXING Phase 3: `RefCell` so the hydrator can
    /// insert during a `&self` read. Same recursion-safety pattern as
    /// `formula_cells`.
    pub(crate) formula_exprs: RefCell<HashMap<CellAddress, Rc<Expr>>>,
    /// Original formula text per cell, for `get_formula` so the formula bar
    /// and edit-mode entry can show the source instead of the computed
    /// result (D.11).
    ///
    /// LAZY_FORMULA_INDEXING Phase 3: `RefCell` for the same hydrator-
    /// from-`&self` reason.
    pub(crate) formula_texts: RefCell<HashMap<CellAddress, String>>,
    /// Lazy-load source storage (Phase 2 of LAZY_FORMULA_INDEXING). Holds
    /// the raw formula text for cells that came in via `bulk_load` and
    /// have NOT yet been parsed / indexed. Mirrors `formula_cells` in
    /// row-major shape so range scans still cost O(cells_in_range), but
    /// each entry is raw source plus one static-validation generation stamp:
    /// no AST, reference set, `FormulaRecord`, or formula-inner derived atom.
    /// Entries are drained
    /// into `formula_cells` / `formula_exprs` / `formula_texts` by
    /// `hydrate_formula` once a read first touches them.
    ///
    /// Co-existence rule: `formula_source.contains_key(addr)` ↔
    /// `needs_parse.contains(addr)`. While the addr is unhydrated:
    ///   - `formula_cells` does NOT have an entry
    ///   - `formula_exprs` does NOT have an entry
    ///   - `formula_texts` does NOT have an entry
    ///   - same-sheet Store edges are absent until the facade/formula-inner
    ///     path materializes; Tier-B geometry roots stay unmaterialized
    /// Hydration moves the source out of `formula_source` and into the
    /// eager state atomically (single-threaded — no races).
    ///
    /// LAZY_FORMULA_INDEXING Phase 3: wrapped in `RefCell` so the
    /// hydrator (which runs from `&self` contexts) can both read the
    /// source and remove the entry after install.
    pub(crate) formula_source: RefCell<RowMajorMap<ParkedFormula>>,
    /// Lazy-load index of unparsed formulas. `RefCell` because read-only
    /// entry points (`peek_value_with_provider`, sparse-iter resolvers,
    /// cycle checks) need to drain entries as part of hydration without
    /// taking `&mut self`.
    ///
    /// Invariant: a single address appears in `needs_parse` iff it also
    /// appears as a key in `formula_source`. Hydration removes from both
    /// in lockstep.
    pub(crate) needs_parse: RefCell<HashSet<CellAddress>>,
    /// Sparse column widths in physical pixels, keyed by 0-based column
    /// (absent → UI default). Lives in the shared interior — rather than
    /// beside `row_styles` on [`Sheet`] — because a formula-inner read_fn
    /// ([`AtomFormulaProvider`], reachable only through the `FacadeCtx`'s
    /// `Rc<SheetInterior>`) needs it to answer `CELL("width")`. Row height
    /// stays inside `row_styles`: no formula reads a row height (Excel has no
    /// `CELL("height")` info_type). Read UNTRACKED (no dependency edge): a bare
    /// column resize does not itself re-derive an existing `CELL("width")`
    /// formula — consistent with `set_col_width` driving no recompute anywhere
    /// today. Same D7 borrow rule as the other interior fields (borrow → copy
    /// out → release; never hold across a `store.*` call).
    pub(crate) col_widths: RefCell<BTreeMap<u32, u32>>,
}
