//! Spill (dynamic-array) projection state: the bookkeeping tables that
//! describe an *installed* spill, plus the install / teardown pair that keeps
//! them in lockstep with `Sheet::cells`.
//!
//! The tables themselves — `spill_targets`, `spill_target_anchor`,
//! `spill_anchor_addr` — stay on `Sheet` in `sheet.rs` because they are struct
//! fields; their doc comments there carry the high-level design rationale and
//! are the reference for everything below. The methods here are the
//! bookkeeping primitives that every spill mutation goes through.
//!
//! Two sibling modules complete the picture: `sheet_spill_claims.rs` owns the
//! BLOCKED registry (an anchor that collided and therefore installed nothing),
//! and `sheet_spill_maintenance.rs` decides *when* a projection has to be
//! re-run.
//!
//! This is a child module of `sheet` rather than a sibling of it in `lib.rs`
//! so that it keeps reaching `Sheet`'s private fields and private helpers
//! (`cell_value_at`, `drop_cell_slot`, `attach_address_sub`, ...) with no
//! visibility widened: `pub(super)` here spans exactly the scope these items
//! had while they were plain private items of `sheet`. `#[path]` keeps the
//! file flat in `src/`, matching the rest of the crate.

use std::sync::Arc;

use einfach_core::{ArrayData, AtomId, Value, ValueError};

use crate::cell::CellAddress;

use super::{CellSlot, Sheet, EXCEL_MAX_COLS, EXCEL_MAX_ROWS};

impl Sheet {
    /// UI helper: if `addr` is a spill *anchor*, return its array shape
    /// `(rows, cols)`. Otherwise None.
    ///
    /// Detection: walk `cells` for `addr`, fetch the underlying atom's
    /// value, and inspect for `Value::Array`. We can't index `spill_targets`
    /// by anchor address — it's keyed by anchor *atom id* — so this lookup
    /// goes through the live value. Anchors that hold `#SPILL!` (collision)
    /// have no `Array` and so return None here, matching Excel's "the
    /// anchor has no spill" semantics in the collision case.
    pub fn spill_info(&self, addr: CellAddress) -> Option<(u32, u32)> {
        match self.cell_value_at(addr)? {
            Value::Array(arr) => Some(arr.shape()),
            _ => None,
        }
    }

    /// True if `addr` is a NON-anchor spilled cell. Convenience for
    /// callers that need to refuse writes or annotate the UI without
    /// resolving the anchor address.
    pub fn is_spilled(&self, addr: CellAddress) -> bool {
        self.spilled_into_anchor(addr).is_some()
    }

    /// True when `addr` sits anywhere inside an ACTIVE spill rectangle — the
    /// anchor itself OR one of its projection cells. This is the per-address
    /// form of the rectangle `sort.rs` §5.1 (`sort_spill_intersecting`) tests
    /// a whole range against, and the two must stay the same predicate: ADR
    /// 0006's「明确非目标」keeps sort and auto-fill on *whole-request*
    /// rejection, so a rectangle one of them refuses the other may not accept.
    ///
    /// The anchor half is keyed off `spill_targets` rather than the anchor's
    /// VALUE (which is what `spill_info` reads): a COLLIDED anchor holds
    /// `#SPILL!`, installed nothing, and therefore owns no cells — it must read
    /// false here so that removing the obstruction by sort or fill stays
    /// possible, which is the whole point of the stage-2 revive path.
    pub fn is_spill_region(&self, addr: CellAddress) -> bool {
        if self.is_spilled(addr) {
            return true;
        }
        self.interior
            .cells
            .borrow()
            .get(&addr)
            .and_then(|slot| slot.atom_id())
            .is_some_and(|atom| self.spill_targets.contains_key(&atom))
    }

    /// Public accessor for `spilled_into_anchor`. Returns the anchor
    /// address of the spill range that covers `addr`, or `None` if
    /// `addr` is not a spilled (non-anchor) cell. Used by JS UI hosts
    /// to draw the spill outline relative to the anchor even when the
    /// anchor cell falls outside the visible window.
    pub fn spill_anchor_for(&self, addr: CellAddress) -> Option<CellAddress> {
        self.spilled_into_anchor(addr)
    }

    /// If `addr` is part of an active spill range whose anchor lives
    /// elsewhere, return the anchor's address. Returns None when `addr`
    /// is either the anchor itself, a plain cell, or empty.
    ///
    /// Implementation (AUDIT A-8): one probe of the reverse index
    /// `spill_target_anchor`. This sits on EVERY single-cell write path
    /// (`try_set_cell` / `try_set_formula` / the BulkLoader spill
    /// guards), so it must not scale with spill size — the previous
    /// Phase 1 shape scanned all target lists and then reverse-scanned
    /// `cells` for the anchor.
    pub(super) fn spilled_into_anchor(&self, addr: CellAddress) -> Option<CellAddress> {
        self.spill_target_anchor
            .get(&addr)
            .map(|&(_, anchor_addr)| anchor_addr)
    }

    /// Look up the anchor address for a given anchor atom. Used by
    /// `teardown_all_spills` (AUDIT A-5) to snapshot anchor addresses
    /// before a structural shift. One probe of `spill_anchor_addr`
    /// (A-8 follow-up) — the previous shape reverse-scanned `cells`,
    /// O(active spills × cells) per structural op.
    pub(super) fn anchor_address_for(&self, anchor_atom: AtomId) -> Option<CellAddress> {
        self.spill_anchor_addr.get(&anchor_atom).copied()
    }

    /// Install spilled derived atoms for every non-(0,0) target inside
    /// the array's bounding rectangle anchored at `anchor_addr`. The
    /// anchor's own atom is expected to already hold `Value::Array(arr)`
    /// — this method only wires up the targets.
    ///
    /// Returns `Err(ValueError::Spill)` if any target collides with an
    /// existing non-empty cell. On error NO targets are installed and the
    /// caller is responsible for routing `#SPILL!` to the anchor.
    ///
    /// Collision rule: a target cell is "occupied" if it has a primitive
    /// atom holding a non-Null value, OR it is itself a formula cell, OR
    /// it is currently a spilled cell from another anchor. A truly-empty
    /// cell (no atom or atom = Null with no formula) is fine to spill into.
    pub(super) fn register_spill(
        &mut self,
        anchor_addr: CellAddress,
        anchor_atom: AtomId,
        arr: &Arc<ArrayData>,
    ) -> Result<(), ValueError> {
        let (rows, cols) = arr.shape();
        if rows == 0 || cols == 0 {
            // Empty array — nothing to spill into. Treat as success.
            self.spill_targets.insert(anchor_atom, Vec::new());
            self.spill_anchor_addr.insert(anchor_atom, anchor_addr);
            return Ok(());
        }
        let end_row = anchor_addr
            .row
            .checked_add(rows - 1)
            .ok_or(ValueError::Spill)?;
        let end_col = anchor_addr
            .col
            .checked_add(cols - 1)
            .ok_or(ValueError::Spill)?;
        if end_row >= EXCEL_MAX_ROWS || end_col >= EXCEL_MAX_COLS {
            return Err(ValueError::Spill);
        }

        // First pass: collision detection. We compute every target
        // (skipping (0, 0) which is the anchor) and ensure no obstruction.
        let mut targets: Vec<CellAddress> =
            Vec::with_capacity((rows as usize) * (cols as usize) - 1);
        for di in 0..rows {
            for dj in 0..cols {
                if di == 0 && dj == 0 {
                    continue;
                }
                let target = CellAddress::new(anchor_addr.row + di, anchor_addr.col + dj);
                if self.is_target_occupied(target, anchor_atom) {
                    return Err(ValueError::Spill);
                }
                targets.push(target);
            }
        }

        // Second pass: install. For each target, create a derived atom
        // that reads the anchor and indexes into the array at the offset
        // implied by (di, dj). The derived atom is registered in `cells`
        // under the target address so reads go through the normal path.
        let mut idx = 0usize;
        for di in 0..rows {
            for dj in 0..cols {
                if di == 0 && dj == 0 {
                    continue;
                }
                let target = targets[idx];
                idx += 1;
                let anchor_atom_for_read = anchor_atom;
                let row_off = di;
                let col_off = dj;
                let derived =
                    self.owned_create_derived(move |get| match get(anchor_atom_for_read) {
                        Value::Array(inner) => {
                            inner.get(row_off, col_off).cloned().unwrap_or(Value::Null)
                        }
                        // Anchor switched off Array (e.g. became #SPILL! after
                        // a later remap that hasn't yet cleared us). Return
                        // Null defensively — the parent re-spill will
                        // re-install a fresh derived atom anyway.
                        _ => Value::Null,
                    });

                // If there was a stale primitive at this address (e.g.
                // empty `Value::Null` placeholder created by a previous
                // subscribe), remove it first so we don't leak an atom.
                let pre_range_member = self.range_member_present(target);
                self.drop_cell_slot(target);
                self.interior
                    .cells
                    .borrow_mut()
                    .insert(target, CellSlot::Atom(derived));
                self.attach_address_sub(target);
                self.bump_facade_epoch(target);
                self.bump_range_epochs_if_membership_changed(target, pre_range_member);
            }
        }

        // Keep the reverse index in lockstep (AUDIT A-8).
        for &target in &targets {
            self.spill_target_anchor
                .insert(target, (anchor_atom, anchor_addr));
        }
        self.spill_targets.insert(anchor_atom, targets);
        self.spill_anchor_addr.insert(anchor_atom, anchor_addr);
        Ok(())
    }

    /// Detect whether `target` is currently occupied for spill purposes.
    /// `our_anchor_atom` is the anchor we're spilling FROM — entries in
    /// `spill_targets[our_anchor_atom]` should NOT be considered
    /// collisions (we're re-spilling into our own previous range).
    fn is_target_occupied(&self, target: CellAddress, our_anchor_atom: AtomId) -> bool {
        // (a) Formula cell at target — always blocks. Unhydrated lazy
        // formulas count too: a same-cell collision with a deferred
        // formula must surface as #SPILL!, not pass through.
        if self.interior.formula_cells.borrow().contains_key(&target)
            || self.interior.needs_parse.borrow().contains(&target)
        {
            return true;
        }
        // (b) Primitive slot holding a non-Null value. `Plain` slots are
        // covered too (AUDIT B-2): a bulk-installed value blocks the
        // spill exactly like its materialized-atom equivalent would.
        if let Some(v) = self.cell_value_at(target) {
            if !matches!(v, Value::Null) {
                // (c) Spilled cell? One probe of the reverse index
                // (AUDIT A-8). Our OWN previous target is not a
                // collision (we're re-spilling — caller tears the old
                // spill down before register_spill, so this branch is
                // defensive); any OTHER anchor's target is.
                if let Some(&(anchor_atom, _)) = self.spill_target_anchor.get(&target) {
                    return anchor_atom != our_anchor_atom;
                }
                // Plain non-Null primitive — collision.
                return true;
            }
        }
        false
    }

    /// Inverse of `register_spill`. For each derived atom recorded under
    /// `anchor_atom`, remove it from `cells` and destroy the underlying
    /// atom. The anchor itself is NOT touched — caller decides whether
    /// to leave the anchor in place (re-spill incoming) or also clear it.
    ///
    /// Subscribers on the cleared addresses are re-fired via the
    /// remap helper so listeners observe the now-empty cell.
    pub(super) fn clear_spill(&mut self, anchor_atom: AtomId) {
        let Some(targets) = self.spill_targets.remove(&anchor_atom) else {
            return;
        };
        self.spill_anchor_addr.remove(&anchor_atom);
        let registry_active = self.has_blocked_anchors();
        for target in targets {
            // Drop the reverse-index entry (AUDIT A-8) — but only when
            // it still points at THIS anchor: a degenerate re-register
            // may have flipped the target to another anchor without
            // this anchor's list being pruned first.
            if self
                .spill_target_anchor
                .get(&target)
                .is_some_and(|&(a, _)| a == anchor_atom)
            {
                self.spill_target_anchor.remove(&target);
            }
            // Detach the address subscription bucket from the soon-dead
            // atom; reattach after removal so listeners refresh.
            self.detach_address_sub(target);
            // Spilled cells are read-only derived atoms with (typically)
            // no further atom-level dependents. Formula cells that
            // referenced this address read through facade atoms, so destroy
            // is safe. If something did register
            // a downstream derived atom (no API for that today),
            // `drop_cell_slot` leaks the spilled derived atom rather than
            // panic — acknowledged as a Phase 1 limitation.
            let pre_range_member = self.range_member_present(target);
            self.drop_cell_slot(target);
            self.attach_address_sub(target);
            self.bump_facade_epoch(target);
            self.bump_range_epochs_if_membership_changed(target, pre_range_member);
            // ADR 0006 stage 2 — `target` is empty again, which may be exactly
            // what was blocking some OTHER anchor. Nothing in the caller's own
            // bookkeeping can name that anchor: the user touched this array, not
            // the blocked one. Post the claim so the re-projection pass picks it
            // up. Guarded on the registry being non-empty, so a 100k-cell
            // teardown on a sheet with no `#SPILL!` pays one field read total,
            // not 100k hash probes.
            if registry_active {
                self.note_freed_spill_cell(target);
            }
        }
    }

    /// ADR 0006 stage 1 — tear the spill down so `addr`, currently a
    /// non-anchor projection cell, can receive a literal or a formula.
    /// Returns the anchor address when a spill was collapsed.
    ///
    /// ORDER RULE: every caller must run this BEFORE any `ensure_cell` /
    /// `store.set` at `addr`. A projection cell's slot holds a read-only
    /// DERIVED atom, and `einfach_core`'s `Store::set` asserts
    /// `read_fn.is_none()` — writing one is a panic, not a wrong value. The
    /// pre-ADR code avoided that panic by refusing the write outright
    /// (`SheetError::SpillCellWrite`); collapsing first is the fix the ADR's
    /// archaeology identified as available all along.
    ///
    /// Only the projection is undone here. Routing `#SPILL!` to the anchor is
    /// deliberately left to `recompute_array_formula`, which the caller reaches
    /// by putting the returned address into its re-projection set: re-running
    /// the anchor's formula ends in `register_spill` colliding with the value
    /// the user just wrote, which produces `Error(Spill)` through the existing
    /// collision path. A hand-written `#SPILL!` here would be a second,
    /// divergence-prone spelling of that rule.
    ///
    /// The one case that cannot go through the formula path is a NON-formula
    /// anchor (`set_array`, a test/debug entry point): `recompute_array_formula`
    /// no-ops on it because there is no formula to re-run, and the array it held
    /// is the only copy, so the projection is written here directly.
    pub(super) fn collapse_spill_for_write(&mut self, addr: CellAddress) -> Option<CellAddress> {
        let &(anchor_atom, anchor_addr) = self.spill_target_anchor.get(&addr)?;
        self.clear_spill(anchor_atom);
        let anchor_is_formula = self
            .interior
            .formula_cells
            .borrow()
            .contains_key(&anchor_addr)
            || self.interior.needs_parse.borrow().contains(&anchor_addr);
        if !anchor_is_formula {
            self.store.set(anchor_atom, Value::Error(ValueError::Spill));
            self.bump_facade_epoch(anchor_addr);
        }
        Some(anchor_addr)
    }

    /// Locate the anchor atom for `addr` (if any) and clear its spill.
    /// Used when overwriting the anchor cell — the new write replaces
    /// the array, so the old spill must go away. No-op when `addr` is
    /// not a spill anchor.
    pub(super) fn clear_spill_at_address(&mut self, addr: CellAddress) {
        // ADR 0006 stage 0: this is the one hook every public write path
        // already funnels through before replacing `addr`'s content
        // (`try_set_cell`, `try_set_formula`, `write_error`, `set_array`,
        // all three `BulkLoader` setters). A blocked claim at `addr` dies
        // with that content, so retiring the registry entry here is what
        // keeps the set from accumulating addresses that are no longer
        // `#SPILL!`. The `is_empty` guard keeps the overwhelmingly common
        // collision-free sheet at a field read per write rather than a
        // hash probe.
        if self.has_blocked_anchors() {
            self.retire_blocked_anchor(addr);
        }
        // `Plain` slots can never be spill anchors — nothing to clear.
        let atom_id = self
            .interior
            .cells
            .borrow()
            .get(&addr)
            .and_then(|slot| slot.atom_id());
        let Some(atom_id) = atom_id else {
            return;
        };
        if self.spill_targets.contains_key(&atom_id) {
            self.clear_spill(atom_id);
        }
    }

    /// Install (or refresh) a primitive anchor atom holding `arr` at
    /// `addr` for a formula whose latest result was `Value::Array(arr)`.
    /// The formula record at `addr` is preserved — only the primitive
    /// atom in `interior.cells[addr]` is created / updated to mirror the
    /// formula's array result, so spilled derived atoms have a
    /// dependency-tracked source to read.
    ///
    /// On spill collision the caller replaces the anchor projection with
    /// `Value::Error(Spill)`. The formula facade reads formula-inner first,
    /// then this anchor atom, so Store propagation surfaces `#SPILL!` without
    /// making the compatibility cache authoritative for same-sheet formulas.
    ///
    /// Returns `Ok(())` on clean install or `Err(ValueError::Spill)` on
    /// collision. Other variants propagate from `register_spill`.
    pub(super) fn install_formula_spill(
        &mut self,
        addr: CellAddress,
        arr: Arc<ArrayData>,
    ) -> Result<(), ValueError> {
        // Reuse the anchor primitive atom if it already exists (re-spill
        // case — same address, shape may or may not differ). Otherwise
        // create one. The atom holds `Value::Array` so the per-target
        // derived atoms (installed below) can read it.
        let anchor_atom = self.ensure_cell(addr);
        self.attach_address_sub(addr);
        self.store.set(anchor_atom, Value::Array(arr.clone()));
        self.register_spill(addr, anchor_atom, &arr)
    }

    /// Number of active spill anchors (entries in the `spill_targets`
    /// bookkeeping map). Scale-suite leak probe: clearing an anchor must
    /// return this to its pre-spill baseline.
    #[doc(hidden)]
    pub fn debug_spill_anchor_count(&self) -> usize {
        self.spill_targets.len()
    }

    /// Total number of installed spill TARGET cells across all anchors
    /// (sum of `spill_targets` value lengths; excludes the anchors
    /// themselves). Scale-suite leak probe companion to
    /// `debug_spill_anchor_count`.
    #[doc(hidden)]
    pub fn debug_spill_target_count(&self) -> usize {
        self.spill_targets.values().map(|t| t.len()).sum()
    }

    /// Size of the AUDIT A-8 reverse spill index (`target address →
    /// anchor`). Scale-suite invariant probe: must equal
    /// `debug_spill_target_count()` at all times — install, re-spill,
    /// teardown — or the O(1) write guards are consulting a stale map.
    #[doc(hidden)]
    pub fn debug_spill_reverse_index_len(&self) -> usize {
        self.spill_target_anchor.len()
    }

    /// Size of the anchor-address index (`anchor atom → anchor addr`,
    /// A-8 follow-up). Scale-suite invariant probe: must equal
    /// `debug_spill_anchor_count()` at all times — install, re-spill,
    /// structural shift, teardown — or `teardown_all_spills` is reading
    /// stale anchor addresses.
    #[doc(hidden)]
    pub fn debug_spill_anchor_index_len(&self) -> usize {
        self.spill_anchor_addr.len()
    }
}
