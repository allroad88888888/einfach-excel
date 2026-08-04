//! 原子与公式缓存规模的调试口径。
//!
//! 拆自 `sheet.rs`，是 `sheet` 的子模块 —— 照旧看得见 `Sheet` 的私有字段与私有
//! 方法。原来的私有项在这里写成 `pub(super)`，覆盖范围与它们留在 `sheet.rs`
//! 里时逐字相同。

use super::*;

impl Sheet {
    // === LAZY_FORMULA_EVAL Step 0 — debug counters ===
    //
    // These expose lazy formula and Store materialization behavior for
    // tests / benches / dev tooling.
    //
    // All `#[doc(hidden)]` — not part of the public API surface, intended
    // for tests / benches / dev tooling.

    /// Number of non-empty primitive cell slots — parked plain values
    /// (AUDIT B-2 lazy atomization) plus materialized atoms. One per
    /// address that has been set or referenced from a formula. Empty
    /// addresses don't count even if subscribed (verified by
    /// `subscribe_empty_cell_does_not_materialize_until_write`). For the
    /// materialized-atom subset only, see
    /// `debug_materialized_cell_atom_count`.
    #[doc(hidden)]
    pub fn debug_primitive_atom_count(&self) -> usize {
        self.interior.cells.borrow().len()
    }

    /// Number of primitive cell slots that hold a real store atom
    /// (`CellSlot::Atom`). AUDIT B-2 pin: a primitives-only bulk install
    /// leaves this at 0 — atoms allocate on first subscribe / write /
    /// spill registration, never eagerly.
    #[doc(hidden)]
    pub fn debug_materialized_cell_atom_count(&self) -> usize {
        self.interior
            .cells
            .borrow()
            .iter()
            .filter(|(_, slot)| matches!(slot, CellSlot::Atom(_)))
            .count()
    }

    /// Number of logical formula cells. Hydrated same-sheet formulas own a
    /// core formula-inner derived atom; this counter measures formula
    /// addresses rather than atom count.
    ///
    /// LAZY_FORMULA_INDEXING Phase 3: counts hydrated formulas (in
    /// `formula_cells`) plus parked lazy formulas (in `formula_source`).
    /// The scale suite relies on this returning N immediately after
    /// `bulk_load` of N formulas, even if no reads have hydrated yet.
    #[doc(hidden)]
    pub fn debug_formula_count(&self) -> usize {
        self.interior.formula_cells.borrow().len() + self.interior.formula_source.borrow().len()
    }

    /// Formula-inner Store state without evaluating the formula. Parked or
    /// not-yet-materialized formulas report `dirty`; a settled derived atom
    /// reports `clean`.
    #[doc(hidden)]
    pub fn debug_formula_cache_state(&self, addr_str: &str) -> &'static str {
        let Some(addr) = CellAddress::parse(addr_str) else {
            return "invalid";
        };
        // LAZY_FORMULA_INDEXING Phase 3: report unhydrated formulas
        // as "dirty" — they have no FormulaRecord yet, but
        // semantically they would compute fresh on the next read
        // (matches the pre-lazy contract: every just-imported
        // formula starts dirty).
        if self.interior.needs_parse.borrow().contains(&addr) {
            return "dirty";
        }
        if !self.interior.formula_cells.borrow().contains_key(&addr) {
            return "none";
        }
        let Some(inner) = self.formula_inner_family.borrow().get(&addr) else {
            return "dirty";
        };
        if self.store.debug_atom_is_fresh(inner) {
            "clean"
        } else {
            "dirty"
        }
    }

    /// Total live sheet-owned core atoms, including primitive slots, facade /
    /// epoch atoms, range geometry epochs, and formula-inner derived atoms.
    /// Useful as a gross "did anything materialize?" signal in tests.
    #[doc(hidden)]
    pub fn debug_total_atom_count(&self) -> usize {
        // Sheet-local count (P3): with the workbook-shared store,
        // store.debug_total_atom_count() would sum every sheet.
        self.atoms_owned.get()
    }

    /// Cumulative core derived recompute count from the underlying store.
    /// Formula-inner and facade recomputes are part of the atomm path and are
    /// reflected here, including workbook-scoped reads in the shared Store.
    #[doc(hidden)]
    pub fn debug_recompute_count(&self) -> usize {
        self.store.debug_recompute_count()
    }

    /// Total formula evaluations performed since the sheet was created.
    /// Bumped once per completed formula-inner evaluation; settled Store reads
    /// are free. Used by the Phase 1 scale suite to assert
    /// `bulk_load` does no eager eval and viewport reads only evaluate
    /// visible formulas.
    #[doc(hidden)]
    pub fn debug_formula_eval_count(&self) -> usize {
        self.formula_eval_count.get()
    }

    /// Number of formula records without a settled formula-inner Store value,
    /// plus parked formulas awaiting hydration.
    #[doc(hidden)]
    pub fn debug_dirty_count(&self) -> usize {
        // LAZY_FORMULA_INDEXING Phase 3: also count unhydrated lazy
        // formulas — they're semantically Dirty (will compute on
        // first read). Counting just the hydrated cells would let the
        // scale suite's "N dirty after bulk_load" assertion drop to
        // zero after lazy bulk_load even though every cell is still
        // "pending compute".
        let hydrated_addrs: Vec<CellAddress> =
            self.interior.formula_cells.borrow().keys().collect();
        let family = self.formula_inner_family.borrow();
        let hydrated_dirty = hydrated_addrs
            .into_iter()
            .filter(|addr| {
                family
                    .get(addr)
                    .is_none_or(|id| !self.store.debug_atom_is_fresh(id))
            })
            .count();
        hydrated_dirty + self.interior.needs_parse.borrow().len()
    }

    /// Number of formulas registered via `bulk_load` (cumulative since the
    /// sheet was created). The plain `Sheet::set_formula` path does NOT
    /// increment this. Used by the scale suite to verify the import path
    /// is exercised and to distinguish bulk-loaded from live-edited formulas.
    #[doc(hidden)]
    pub fn debug_imported_formula_count(&self) -> usize {
        self.imported_formula_count.get()
    }

    /// Cumulative Store reverse-dependency formula visits since the sheet was
    /// created. Scale-suite complexity probe: the total eager spill work of a
    /// workload is `delta(this)` and must be bounded by formulas reachable
    /// from the changed cell/facade/geometry roots.
    #[doc(hidden)]
    pub fn debug_reverse_dep_visit_count(&self) -> u64 {
        self.reverse_dep_visit_count.get()
    }

    /// Cumulative number of formula AST nodes expanded by parked-formula
    /// static cycle validation. A topology certificate hit adds zero.
    #[doc(hidden)]
    pub fn debug_static_cycle_node_visit_count(&self) -> u64 {
        self.static_cycle_node_visit_count.get()
    }

    /// Cumulative `has_address_subscribers` probes performed by
    /// `BulkLoader::flush`'s notify tail (AUDIT B-5). Stays flat across
    /// a bulk load when the sheet has zero address subscriptions.
    #[doc(hidden)]
    pub fn debug_bulk_notify_probe_count(&self) -> u64 {
        self.bulk_notify_probe_count.get()
    }

    /// Number of distinct `CellAddress`es with at least one live listener
    /// in `cell_subscriptions`. An address whose last listener was removed
    /// drops out of the map (`unsubscribe_cell`), so this is just the live
    /// bucket count. Used to verify subscription teardown.
    #[doc(hidden)]
    pub fn debug_live_subscription_count(&self) -> usize {
        self.cell_subscriptions
            .values()
            .filter(|bucket| !bucket.listeners.borrow().is_empty())
            .count()
    }
}
