//! 把格子清空，并释放它不再需要的原子。
//!
//! 拆自 `sheet.rs`，是 `sheet` 的子模块 —— 照旧看得见 `Sheet` 的私有字段与私有
//! 方法。原来的私有项在这里写成 `pub(super)`，覆盖范围与它们留在 `sheet.rs`
//! 里时逐字相同。

use super::*;

impl Sheet {
    /// Clear a cell back to empty (Null). Equivalent to `set_cell(addr, Value::Null)`
    /// but with a more discoverable name for callers implementing Delete-key /
    /// undo-to-empty UX. Silently no-ops on spill rejection — use
    /// `try_clear_cell` if you need the error.
    pub fn clear_cell(&mut self, addr_str: &str) {
        let _ = self.try_clear_cell(addr_str);
    }

    /// Fallible variant of `clear_cell`. Returns the same error variants
    /// as `try_set_cell` with `Value::Null`.
    pub fn try_clear_cell(&mut self, addr_str: &str) -> Result<(), SheetError> {
        let addr = CellAddress::parse(addr_str).ok_or(SheetError::InvalidAddress)?;
        self.try_set_cell(addr_str, Value::Null)?;
        // set_cell already calls try_release_primitive when the new value is
        // Null; the second call here is defensive in case a future change to
        // set_cell rearranges that path. It's a no-op when the cell was
        // already released.
        self.try_release_primitive(addr);
        Ok(())
    }

    /// 3.10 — release the primitive cell atom for `addr` when it is Null and
    /// has no direct dependents other than the address's stable facade. Used
    /// by `clear_cell` / `set_cell(.., Null)` to keep `cells.len()` bounded
    /// across long-running sheets where many cells get set then cleared.
    ///
    /// When a facade exists, removing the slot and bumping its epoch first
    /// makes Store re-derive it as Absent. That atomically severs the old
    /// primitive edge while preserving facade identity and address listeners.
    pub(super) fn try_release_primitive(&mut self, addr: CellAddress) {
        // ADR 0006 stage 1 — a spill projection cell's slot holds a derived
        // atom owned by `spill_targets`, not a releasable primitive. This was
        // unreachable while target writes were refused (`try_clear_cell` bailed
        // with `?` before getting here); now that a Delete over a projection
        // cell returns `Ok`, an array element that happens to BE `Value::Null`
        // would otherwise pass the Null test below and get destroyed out from
        // under its anchor.
        if self.spilled_into_anchor(addr).is_some() {
            return;
        }
        // P4a borrow rule: classify the slot under a short borrow
        // (`Ok(atom_id)` for materialized slots, `Err(plain_is_null)`
        // for parked plain values), then act with the guard released —
        // the release paths below re-borrow `cells` mutably and call
        // into the store.
        let probe: Result<AtomId, bool> = {
            let cells = self.interior.cells.borrow();
            match cells.get(&addr) {
                None => return,
                Some(CellSlot::Plain(value)) => Err(matches!(value, Value::Null)),
                Some(CellSlot::Atom(id)) => Ok(*id),
            }
        };
        // Formula cells are lazy records, not primitive atoms.
        // LAZY_FORMULA_INDEXING Phase 3: also skip when an unhydrated
        // formula is parked at `addr` — the eventual hydration will
        // reuse the primitive slot if it needs one.
        if self.interior.formula_cells.borrow().contains_key(&addr)
            || self.interior.needs_parse.borrow().contains(&addr)
        {
            return;
        }
        let atom_id = match probe {
            // AUDIT B-2: `Plain` slots hold non-Null values by invariant
            // (every Null-writing path promotes via `ensure_cell` first);
            // a Null that slips through is released without ever having
            // had an atom.
            Err(plain_is_null) => {
                if plain_is_null {
                    self.interior.cells.borrow_mut().remove(&addr);
                    self.detach_address_sub(addr);
                }
                return;
            }
            Ok(id) => id,
        };
        if !self.store.has_atom(atom_id) {
            // Defensive: nothing to release.
            self.interior.cells.borrow_mut().remove(&addr);
            return;
        }
        if !matches!(self.store.get(atom_id), Value::Null) {
            return;
        }

        let facade_id = self.cell_facade_family.borrow().get(&addr);
        if self
            .store
            .direct_dependents(atom_id)
            .into_iter()
            .any(|dependent| Some(dependent) != facade_id)
        {
            return;
        }

        self.interior.cells.borrow_mut().remove(&addr);
        if facade_id.is_some() {
            self.bump_facade_epoch(addr);
        }

        // A facade-only edge must be gone after the epoch re-derivation. Keep
        // the slot intact in the defensive case where a re-entrant listener
        // installed a new direct dependent while the facade was settling.
        if self.store.has_dependents(atom_id) {
            self.interior
                .cells
                .borrow_mut()
                .insert(addr, CellSlot::Atom(atom_id));
            self.bump_facade_epoch(addr);
            return;
        }
        self.owned_destroy_atom(atom_id);
    }

    /// Clear every non-empty address inside `range` without materializing
    /// holes. Uses bulk-load so Store publication and subscriber notification
    /// are coalesced once after the sparse scan.
    pub fn clear_range(&mut self, range: CellRange) -> usize {
        let mut addrs = Vec::new();
        self.for_each_non_empty_in_range(range, |addr| addrs.push(addr));
        let cleared = addrs.len();
        self.bulk_load(|loader| {
            for addr in addrs {
                // AUDIT A-9 (folded into A-3): typed-address entry —
                // no to_string→re-parse round trip per cleared cell.
                loader.set_cell_at(addr, Value::Null);
            }
        });
        cleared
    }
}
