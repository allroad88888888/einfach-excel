//! 单元格门面原子的物化与失效纪元的推进。
//!
//! 拆自 `sheet.rs`，是 `sheet` 的子模块 —— 照旧看得见 `Sheet` 的私有字段与私有
//! 方法。原来的私有项在这里写成 `pub(super)`，覆盖范围与它们留在 `sheet.rs`
//! 里时逐字相同。

use super::*;

impl Sheet {
    /// The per-address facade derived atom: the stable subscription anchor
    /// for all address listeners. Idempotent: returns the cached facade if one
    /// exists, else lazily creates the slot-epoch primitive and the facade
    /// derived atom.
    ///
    /// The facade reads its slot-epoch (tracked — a `literal↔formula` overwrite
    /// or clear that bumps the epoch re-runs the facade WITHOUT re-keying any
    /// subscription) then the CURRENT inner atom for the address. Only the
    /// BORROW RULE (D7): every family guard and the `interior.cells` borrow
    /// inside the read closure is released (inner id copied / plain value
    /// cloned) before any `store.*` call. The read closure captures only owned
    /// values / `Rc` clones — never `self` — so it satisfies the `'static`
    /// bound and can resolve the inner atom on demand under `&self`.
    ///
    /// This is a thin wrapper over [`FacadeCtx::get_or_create_facade`]: the
    /// facade logic lives on the `'static`-capturable [`FacadeCtx`] so the
    /// forthcoming inner formula read closure can resolve referenced cells'
    /// facades on demand without an `&Sheet`.
    pub(super) fn facade_of(&self, addr: CellAddress) -> AtomId {
        self.facade_ctx().get_or_create_facade(addr)
    }

    /// Build a [`FacadeCtx`] snapshot of this sheet's shared handles. Cheap —
    /// clones a `Store` handle and four `Rc`s. The returned ctx is `'static`
    /// and `Clone`, so it can be moved into store `read_fn` closures.
    pub(crate) fn facade_ctx(&self) -> FacadeCtx {
        FacadeCtx {
            store: self.store.clone(),
            atoms_owned: Rc::clone(&self.atoms_owned),
            interior: Rc::clone(&self.interior),
            slot_epoch_family: Rc::clone(&self.slot_epoch_family),
            cell_facade_family: Rc::clone(&self.cell_facade_family),
            formula_inner_family: Rc::clone(&self.formula_inner_family),
            range_band_epoch_family: Rc::clone(&self.range_band_epoch_family),
            range_column_epoch_family: Rc::clone(&self.range_column_epoch_family),
            range_sheet_epoch_family: Rc::clone(&self.range_sheet_epoch_family),
            in_flight: Rc::clone(&self.in_flight),
            workbook_context: Rc::clone(&self.workbook_context),
            workbook_sheet_index: Rc::clone(&self.workbook_sheet_index),
            formula_eval_count: Rc::clone(&self.formula_eval_count),
        }
    }

    /// P4c write口 helper — bump this address's slot-epoch primitive so a
    /// materialized facade re-derives after an inner-atom IDENTITY change
    /// (formula↔literal, Plain/Absent→Atom, slot removal Atom→None). A
    /// same-id literal value update needs NO bump: the facade re-runs off its
    /// native `args.get(inner)` edge when `store.set(inner, ..)` flushes.
    ///
    /// NON-CREATING (INV-7): if no epoch atom exists for `addr`, no facade was
    /// ever materialized here, so there is nothing to notify — early return.
    /// The value is a MONOTONE counter (never re-set to an equal value) so the
    /// store's equal-value short-circuit can't swallow the bump and an ABA
    /// within one batch still forces re-derivation.
    ///
    pub(super) fn bump_facade_epoch(&self, addr: CellAddress) {
        let Some(epoch_id) = self.slot_epoch_family.borrow().get(&addr) else {
            return;
        };
        let next = match self.store.get(epoch_id) {
            Value::Number(n) => Value::Number(n + 1.0),
            _ => Value::Number(1.0),
        };
        self.store.set(epoch_id, next);
    }

    pub(super) fn bump_existing_epoch(&self, id: AtomId) {
        let next = match self.store.get(id) {
            Value::Number(n) => Value::Number(n + 1.0),
            _ => Value::Number(1.0),
        };
        self.store.set(id, next);
    }

    pub(super) fn bump_range_geometry_epochs_touching(&self, addr: CellAddress) {
        let band_key = range_band_key_for_addr(addr);
        let band_id = { self.range_band_epoch_family.borrow().get(&band_key) };
        if let Some(id) = band_id {
            self.bump_existing_epoch(id);
        }

        let column_key = RangeColumnKey { col: addr.col };
        let column_id = { self.range_column_epoch_family.borrow().get(&column_key) };
        if let Some(id) = column_id {
            self.bump_existing_epoch(id);
        }

        let sheet_id = { self.range_sheet_epoch_family.borrow().get(&()) };
        if let Some(id) = sheet_id {
            self.bump_existing_epoch(id);
        }
    }

    pub(super) fn bump_range_membership_epochs_touching(&self, addr: CellAddress) {
        self.bump_range_geometry_epochs_touching(addr);
    }

    /// Sparse range membership matches `range_member_addrs`: a non-Null
    /// primitive value or formula/source record exists at the address. A Null
    /// primitive atom retained by Store dependents remains an internal anchor,
    /// not a worksheet member.
    pub(super) fn range_member_present(&self, addr: CellAddress) -> bool {
        self.interior.formula_cells.borrow().contains_key(&addr)
            || self.interior.formula_source.borrow().contains_key(&addr)
            || self.primitive_slot_has_visible_value(addr)
    }

    pub(super) fn bump_range_epochs_if_membership_changed(&self, addr: CellAddress, pre_member: bool) {
        if pre_member != self.range_member_present(addr) {
            self.bump_range_membership_epochs_touching(addr)
        }
    }

    /// P4c write口 helper — force this address's formula-inner atom to
    /// re-resolve its AST on the next read. Needed for a formula-CONTENT edit
    /// whose upstream deps are unchanged (`=B1`→`=C1`): the inner atom's
    /// recorded deps ({B1}) are still fresh, so without this it returns the
    /// CACHED old-AST value. Because `Store::invalidate` only marks the atom
    /// stale WITHOUT propagating, this MUST be paired with `bump_facade_epoch`
    /// to drive the facade to re-read the now-stale inner.
    ///
    /// NON-CREATING: a no-op when no inner atom exists (literal→formula and
    /// absent→formula create the inner lazily on the facade's re-derive, so
    /// there is nothing to invalidate here).
    pub(super) fn invalidate_formula_inner(&self, addr: CellAddress) {
        if let Some(inner) = self.formula_inner_family.borrow().get(&addr) {
            self.store.invalidate(inner);
        }
    }

    pub(super) fn materialize_formula_inner(&self, addr: CellAddress) {
        self.facade_ctx().formula_inner_of(addr);
    }

    pub(super) fn invalidate_formula_value(&self, addr: CellAddress) {
        self.invalidate_formula_inner(addr);
        self.bump_facade_epoch(addr);
    }
}
