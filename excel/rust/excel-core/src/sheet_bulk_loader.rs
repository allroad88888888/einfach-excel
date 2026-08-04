//! 批量装载游标的生命周期与字面量写入。
//!
//! 拆自 `sheet.rs`，是 `sheet` 的子模块 —— 照旧看得见 `Sheet` 的私有字段与私有
//! 方法。原来的私有项在这里写成 `pub(super)`，覆盖范围与它们留在 `sheet.rs`
//! 里时逐字相同。

use super::*;

/// In-progress bulk-load session. Writes go directly into the sheet's
/// formula/primitive state while direct address subscriptions are detached;
/// the surrounding Store batch coalesces derived propagation and `flush`
/// restores those subscriptions.
///
/// Only constructable inside `Sheet::bulk_load` (RAII), so the lifetime stays
/// bound to `&mut Sheet` and `flush` is guaranteed to run on the closure exit.
pub struct BulkLoader<'a> {
    pub(super) sheet: &'a mut Sheet,
    /// Addresses written during this bulk load. At `flush()` we notify each
    /// directly subscribed address whose projected value changed once.
    pub(super) touched: HashSet<CellAddress>,
    /// Addresses whose sparse range membership changed during the bulk load.
    /// Flush bumps already-materialized range-version atoms for these roots.
    pub(super) range_membership_changed: HashSet<CellAddress>,
    /// Formula addresses replaced by a primitive/error during this session.
    /// Flush reclaims their now-unreferenced Store-backed family nodes after
    /// the batched epoch changes have settled.
    pub(super) obsolete_formula_addrs: HashSet<CellAddress>,
    /// ADR 0006 stage 1/2 — spill anchors this session must re-project:
    /// anchors whose array a write withdrew (stage 1) and anchors parked at
    /// `#SPILL!` whose obstruction a write may have removed (stage 2).
    ///
    /// Neither is reachable from `flush`'s Store reverse-dependency sweep: a
    /// projection cell depends on its anchor, never the reverse, and a blocked
    /// anchor has no edge to its obstruction at all. So the setters record
    /// them as they go and `flush` unions them in.
    pub(super) spill_anchors_to_reproject: HashSet<CellAddress>,
}

impl<'a> BulkLoader<'a> {
    pub(super) fn new(sheet: &'a mut Sheet) -> Self {
        BulkLoader {
            sheet,
            touched: HashSet::new(),
            range_membership_changed: HashSet::new(),
            obsolete_formula_addrs: HashSet::new(),
            spill_anchors_to_reproject: HashSet::new(),
        }
    }

    /// ADR 0006 stage 1/2 — shared prologue for the three bulk setters.
    /// Withdraws any spill projection at `addr` and records the anchors that
    /// `flush` must re-project. Returns `false` when the write is inert (a
    /// Delete over a projection cell) and the caller should skip it entirely.
    ///
    /// ORDER RULE: every caller runs this before its first `ensure_cell` /
    /// `store.set` at `addr` — see `collapse_spill_for_write`.
    pub(super) fn prepare_spill_for_write(&mut self, addr: CellAddress, blocks_spill: bool) -> bool {
        if !blocks_spill && self.sheet.spilled_into_anchor(addr).is_some() {
            // Same fixpoint argument as `Sheet::set_cell_inner`: a Null write
            // could not have blocked the spill, so collapsing would only
            // re-install the identical projection.
            return false;
        }
        self.spill_anchors_to_reproject
            .extend(self.sheet.blocked_anchors_claiming(addr));
        self.spill_anchors_to_reproject
            .extend(self.sheet.collapse_spill_for_write(addr));
        debug_assert!(
            !self.sheet.spill_target_anchor.contains_key(&addr),
            "ADR 0006: {addr:?} must not be a spill projection cell once the write starts"
        );
        true
    }

    /// Write a primitive value at `addr`. Defers Store publication and direct
    /// subscriber notification to `flush`. Equivalent to
    /// `Sheet::set_cell` outside the bulk-load contract; the address is
    /// recorded in `touched` for the post-flush sweep.
    pub fn set_cell(&mut self, addr_str: &str, value: Value) {
        let addr = CellAddress::parse(addr_str).expect("invalid cell address");
        self.set_cell_at(addr, value);
    }

    /// Typed-address variant of [`Self::set_cell`] (AUDIT A-9): bulk
    /// callers that already hold a `CellAddress` (e.g. `clear_range`'s
    /// sparse scan) skip the string render + re-parse per cell.
    pub fn set_cell_at(&mut self, addr: CellAddress, value: Value) {
        let is_null = matches!(value, Value::Null);

        // AUDIT A-4 / ADR 0006 stage 1 — spill parity with the single-cell
        // mutators (`Sheet::set_cell` / `try_set_cell`). A content write into
        // a non-anchor projection cell WITHDRAWS the array and leaves the
        // anchor at `#SPILL!`; a Delete over one is inert; a write to the
        // ANCHOR tears the spill down before proceeding. Without the
        // withdrawal, `ensure_cell` below returns the read-only derived
        // projection atom and `store.set` panics — that panic, not Excel
        // semantics, is why this used to refuse the write outright.
        if !self.prepare_spill_for_write(addr, !is_null) {
            return;
        }
        let pre_range_member = self.sheet.range_member_present(addr);
        self.sheet.clear_spill_at_address(addr);

        // Detach the fanout for this address so the store-level `set` below
        // does not synchronously fire subscribers. `flush` will reattach and
        // notify exactly once per subscribed touched address.
        self.sheet.detach_address_sub(addr);

        // LAZY_FORMULA_INDEXING Phase 3: lazy and hydrated formulas
        // both transition to primitive here. `remove_formula_record`
        // is a no-op on lazies (no record) — drain `formula_source` /
        // `needs_parse` explicitly so the address stops looking like a
        // formula to any later check.
        let had_formula = self
            .sheet
            .interior
            .formula_cells
            .borrow()
            .contains_key(&addr)
            || self.sheet.interior.needs_parse.borrow().contains(&addr);
        if had_formula {
            self.obsolete_formula_addrs.insert(addr);
            // Formula → primitive transition. Drop the structural formula
            // record, but do not notify yet; primitive scaffold is
            // re-established below.
            self.sheet.remove_formula_record(addr);
            self.sheet
                .interior
                .formula_source
                .borrow_mut()
                .remove(&addr);
            self.sheet.interior.needs_parse.borrow_mut().remove(&addr);
            // The pre-existing primitive atom from formula→primitive remap may
            // still be present; ensure_cell + store.set covers both branches.
            let id = self.sheet.ensure_cell(addr);
            self.sheet.store.set(id, value);
        } else {
            let id = self.sheet.ensure_cell(addr);
            self.sheet.store.set(id, value);
        }

        // 3.10 — same Null-release contract as the normal path so bulk-load
        // does not leak primitive scaffolds when callers write Null. The
        // fanout was already detached above; release just drops the atom and
        // bookkeeping. The bucket (if any) stays for the flush reattach.
        if is_null {
            self.sheet.try_release_primitive(addr);
        }

        self.touched.insert(addr);
        if pre_range_member != self.sheet.range_member_present(addr) {
            self.range_membership_changed.insert(addr);
        }
    }

    /// Drain the touched set, invalidate touched facades plus Store geometry
    /// roots, reattach fanouts on touched primitive addresses, and notify each
    /// directly touched subscribed address at most once.
    ///
    /// Same-sheet formulas are invalidated by Store edges from the touched
    /// facade/inner/geometry atoms. Store reverse reachability is used only to
    /// find dynamic arrays that need eager spill maintenance.
    pub(super) fn flush(&mut self) {
        let touched: Vec<CellAddress> = self.touched.iter().copied().collect();
        let range_membership_changed: Vec<CellAddress> =
            self.range_membership_changed.iter().copied().collect();
        let mut array_formulas_to_reproject = self
            .sheet
            .store_dependent_array_formula_addrs_from_addrs(touched.iter().copied());
        // ADR 0006 stage 1/2 — the anchors the Store sweep above structurally
        // cannot reach. `recompute_array_formulas_in` sorts before running, so
        // the union's hash order never decides which of two contending anchors
        // claims a rectangle.
        array_formulas_to_reproject.extend(self.spill_anchors_to_reproject.drain());
        self.sheet.store_batch(|sheet| {
            for &addr in &touched {
                sheet.invalidate_formula_inner(addr);
                sheet.bump_facade_epoch(addr);
            }
            for addr in range_membership_changed.iter().copied() {
                sheet.bump_range_membership_epochs_touching(addr);
            }
        });
        for addr in self.obsolete_formula_addrs.drain() {
            self.sheet.cleanup_obsolete_formula_atoms_at(addr);
        }

        // Eager spill maintenance follows the Store's reverse dependency
        // graph. Lazy-parked formulas have no live edges until first read, so
        // fresh bulk imports still do zero formula evaluation here.
        self.sheet
            .recompute_array_formulas_in(&array_formulas_to_reproject);

        // AUDIT B-5 — with zero address subscriptions the reattach loop
        // and the touched notify loop below are pure
        // overhead: a 1M-cell restore would pay ~3M hash ops to conclude
        // nobody is watching. `attach_address_sub` is a no-op without a
        // bucket and the notify loop cannot fire, so early-out keeps the
        // legacy loader's notify tail O(0) on the unsubscribed path
        // (pinned by `debug_bulk_notify_probe_count` in the scale suite).
        if self.sheet.cell_subscriptions.is_empty() {
            return;
        }

        // Reattach fanouts on touched addresses so future writes notify
        // normally. Reattach is a no-op when the address has no
        // subscription bucket or no readable atom.
        for &addr in &touched {
            self.sheet.attach_address_sub(addr);
        }

        // Downstream formula subscribers stayed attached and are notified by
        // Store propagation. Only directly touched fanouts were detached.
        self.sheet
            .bulk_notify_probe_count
            .set(self.sheet.bulk_notify_probe_count.get() + touched.len() as u64);
        for addr in touched {
            if self.sheet.has_address_subscribers(addr) {
                self.sheet.notify_address_subscribers(addr);
            }
        }
    }
}
