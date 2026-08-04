//! 一个地址的槽位：它现在是字面量原子还是公式。
//!
//! 拆自 `sheet.rs`，是 `sheet` 的子模块 —— 照旧看得见 `Sheet` 的私有字段与私有
//! 方法。原来的私有项在这里写成 `pub(super)`，覆盖范围与它们留在 `sheet.rs`
//! 里时逐字相同。

use super::*;

/// Storage slot for a primitive cell (AUDIT B-2 — lazy atomization).
///
/// Bulk installs park raw `Value`s (`Plain`); a core store atom is only
/// allocated when something actually needs atom semantics — a subscription
/// fanout attach, a spill anchor/target install, or any mutation path that
/// routes through `ensure_cell`. Mirrors the lazy-formula split one layer
/// down: the storage map is the source of truth, the atom is a demand-
/// created projection. Invariants:
///
///   - `Plain` slots are never `Value::Null` (Null means "absent"; the
///     install path skips Nulls and every write path promotes first).
///   - An address with a live subscription fanout is never `Plain`
///     (`attach_address_sub` promotes before wiring the store sub).
///   - Spill anchors and spill targets are always `Atom` (anchors via
///     `ensure_cell`, targets hold derived atoms).
#[derive(Debug)]
pub(crate) enum CellSlot {
    /// Raw stored value — no core atom allocated yet.
    Plain(Value),
    /// Materialized core atom (primitive or spill-target derived).
    Atom(AtomId),
}

impl CellSlot {
    /// The materialized atom id, if any. `Plain` slots have none.
    pub(super) fn atom_id(&self) -> Option<AtomId> {
        match self {
            CellSlot::Atom(id) => Some(*id),
            CellSlot::Plain(_) => None,
        }
    }
}

impl Sheet {
    /// The materialized primitive atom currently parked at `addr`, iff the slot
    /// holds one (`CellSlot::Atom`). `None` for a `Plain` slot, a formula cell,
    /// or an absent cell. The write口 samples this before and after a mutation
    /// to detect the inner-atom identity transitions that require a facade
    /// epoch bump.
    pub(super) fn slot_atom_id(&self, addr: CellAddress) -> Option<AtomId> {
        match self.interior.cells.borrow().get(&addr) {
            Some(CellSlot::Atom(id)) => Some(*id),
            _ => None,
        }
    }

    pub(super) fn ensure_cell(&mut self, addr: CellAddress) -> AtomId {
        // P4a borrow rule: take the parked value (or bail on Atom) under a
        // short `cells` borrow, release the guard, THEN call into the
        // store — atom creation must never run under a live borrow.
        let parked: Option<Value> = {
            let mut cells = self.interior.cells.borrow_mut();
            match cells.get(&addr) {
                Some(CellSlot::Atom(id)) => return *id,
                Some(CellSlot::Plain(_)) => {
                    let Some(CellSlot::Plain(value)) = cells.remove(&addr) else {
                        unreachable!("slot vanished between get and remove");
                    };
                    Some(value)
                }
                None => None,
            }
        };
        let id = match parked {
            Some(value) => self.owned_create_atom(value),
            None => self.owned_create_atom(Value::Null),
        };
        self.interior
            .cells
            .borrow_mut()
            .insert(addr, CellSlot::Atom(id));
        id
    }

    /// Read the value behind the cell slot at `addr`, if a slot exists.
    /// `Plain` slots return the parked value; `Atom` slots read the store
    /// (Null if the atom was destroyed out from under the slot —
    /// defensive, mirrors the old `has_atom`-guarded reads).
    ///
    /// P4a borrow rule: the slot is snapshotted under a short `cells`
    /// borrow (value cloned / atom id copied) and the guard released
    /// BEFORE the store read.
    pub(super) fn cell_value_at(&self, addr: CellAddress) -> Option<Value> {
        let probe: Result<Value, AtomId> = {
            let cells = self.interior.cells.borrow();
            match cells.get(&addr)? {
                CellSlot::Plain(value) => Ok(value.clone()),
                CellSlot::Atom(id) => Err(*id),
            }
        };
        Some(match probe {
            Ok(value) => value,
            Err(id) => {
                if self.store.has_atom(id) {
                    self.store.get(id)
                } else {
                    Value::Null
                }
            }
        })
    }

    pub(super) fn primitive_slot_has_visible_value(&self, addr: CellAddress) -> bool {
        matches!(
            self.cell_value_at(addr),
            Some(value) if !matches!(value, Value::Null)
        )
    }

    /// Remove the slot at `addr`; if it held a materialized atom with no
    /// live dependents, destroy the atom. `Plain` slots are simply
    /// dropped. Returns whether a slot was present.
    pub(super) fn drop_cell_slot(&mut self, addr: CellAddress) -> bool {
        let removed = self.interior.cells.borrow_mut().remove(&addr);
        let Some(slot) = removed else {
            return false;
        };
        if let CellSlot::Atom(id) = slot {
            if self.store.has_atom(id) && !self.store.has_dependents(id) {
                self.owned_destroy_atom(id);
            }
        }
        true
    }

    /// Get or create the primitive atom for a cell. Formula results no longer
    /// have core atoms; callers needing a raw atom get the primitive slot.
    pub(super) fn readable_atom(&mut self, addr: CellAddress) -> AtomId {
        self.ensure_cell(addr)
    }
}
