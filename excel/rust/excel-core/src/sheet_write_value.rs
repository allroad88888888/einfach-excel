//! 把一个字面量（含数组）写进格子。
//!
//! 拆自 `sheet.rs`，是 `sheet` 的子模块 —— 照旧看得见 `Sheet` 的私有字段与私有
//! 方法。原来的私有项在这里写成 `pub(super)`，覆盖范围与它们留在 `sheet.rs`
//! 里时逐字相同。

use super::*;

impl Sheet {
    /// Write a `Value::Array` to an anchor cell and install / re-install
    /// the spill range. On spill collision, the anchor is set to
    /// `Value::Error(Spill)` and no targets are installed.
    ///
    /// This is the Phase 1 entry point used by tests to exercise the
    /// spill plumbing without a user-facing array-producing function.
    /// Phase 3 will wire the formula eval path to call this when a
    /// formula result evaluates to `Value::Array`.
    ///
    /// Returns the same `Result` shape as `register_spill` so callers
    /// can distinguish "spilled cleanly" from "collision, anchor now
    /// `#SPILL!`". Either outcome leaves the sheet in a consistent
    /// state — the anchor cell always reflects the result.
    pub fn set_array(&mut self, addr_str: &str, arr: Arc<ArrayData>) -> Result<(), SheetError> {
        let addr = CellAddress::parse(addr_str).ok_or(SheetError::InvalidAddress)?;
        // ADR 0006 stage 1 — writing an array INTO another anchor's spill
        // region collapses that spill, same as any other content write
        // (`Value::Array` is non-Null, so it blocks). Wrapped for the
        // single-wave reason documented on `try_set_cell`.
        if self.spilled_into_anchor(addr).is_some() {
            return self.store_batch(|sheet| sheet.set_array_at(addr, arr));
        }
        self.set_array_at(addr, arr)
    }

    pub(super) fn set_array_at(&mut self, addr: CellAddress, arr: Arc<ArrayData>) -> Result<(), SheetError> {
        let collapsed_anchor = self.spilled_into_anchor(addr);
        let blocked_retries = self.blocked_anchors_claiming(addr);
        let pre_range_member = self.range_member_present(addr);
        let had_formula = self.interior.formula_cells.borrow().contains_key(&addr)
            || self.interior.needs_parse.borrow().contains(&addr);
        let mut array_formulas_to_reproject =
            self.store_dependent_array_formula_addrs_from_addrs(std::iter::once(addr));
        array_formulas_to_reproject.extend(collapsed_anchor);
        array_formulas_to_reproject.extend(blocked_retries);

        self.store_batch(|sheet| {
            // ORDER RULE (ADR 0006 stage 1). `collapse_spill_for_write`
            // additionally writes `#SPILL!` straight onto a NON-formula anchor:
            // `set_array` anchors hold their array in the cell atom with no
            // formula behind them, so `recompute_array_formula` no-ops on them
            // and the re-projection set cannot deliver the error.
            sheet.collapse_spill_for_write(addr);
            // Tear down any spill the current cell already owns; we're
            // replacing it.
            sheet.clear_spill_at_address(addr);
            debug_assert!(
                !sheet.spill_target_anchor.contains_key(&addr),
                "ADR 0006: {addr:?} must not be a spill projection cell once the write starts"
            );

            // Drop any prior formula at the anchor — an array write is a
            // primitive-style mutation that replaces formula state.
            //
            // LAZY_FORMULA_INDEXING Phase 3: an unhydrated formula still
            // owns the address. Drain the source / needs_parse entries
            // explicitly; the `formula_cells` map has no record to
            // `remove_formula_record` for an unhydrated addr.
            if had_formula {
                sheet.with_remap(addr, |sheet| {
                    sheet.remove_formula_record(addr);
                    sheet.interior.formula_source.borrow_mut().remove(&addr);
                    sheet.interior.needs_parse.borrow_mut().remove(&addr);
                    let _ = sheet.ensure_cell(addr);
                });
            }

            let anchor_atom = sheet.ensure_cell(addr);
            sheet.attach_address_sub(addr);

            // Write the array to the anchor.
            sheet.store.set(anchor_atom, Value::Array(arr.clone()));

            // Try to install spill targets. On collision, overwrite the
            // anchor with `#SPILL!` so the user sees the error at the
            // anchor cell (Excel parity).
            match sheet.register_spill(addr, anchor_atom, &arr) {
                Ok(()) => {}
                Err(ValueError::Spill) => {
                    sheet
                        .store
                        .set(anchor_atom, Value::Error(ValueError::Spill));
                }
                Err(other) => {
                    // register_spill currently only returns Spill, but
                    // future variants would surface here defensively.
                    sheet.store.set(anchor_atom, Value::Error(other));
                }
            }
            sheet.bump_range_epochs_if_membership_changed(addr, pre_range_member);
            // P4c: drive any materialized facade at the anchor to re-read the new
            // array (identity/value change on the anchor's inner atom). Spill
            // TARGET epoch wiring is deferred to P5. Inert until the read口 flip.
            sheet.bump_facade_epoch(addr);
        });
        if had_formula {
            self.cleanup_obsolete_formula_atoms_at(addr);
        }
        self.recompute_array_formulas_in(&array_formulas_to_reproject);
        Ok(())
    }

    /// Set a cell's value by address string (e.g. "A1").
    /// Clears any existing formula on this cell.
    ///
    /// Panics on an unparseable `addr_str`. The fallible
    /// `try_set_cell` returns `Err(SheetError::InvalidAddress)` instead;
    /// the panic here preserves the historical contract.
    pub fn set_cell(&mut self, addr_str: &str, value: Value) {
        // Preserve legacy panic-on-bad-address contract.
        CellAddress::parse(addr_str).expect("invalid cell address");
        let _ = self.try_set_cell(addr_str, value);
    }

    /// Fallible variant of `set_cell`. Returns `Err(InvalidAddress)` when the
    /// address string fails to parse (the infallible variant panics).
    ///
    /// ADR 0006 stage 1: writing into a dynamic array's spill region is no
    /// longer refused. The write lands, the whole array is withdrawn, and its
    /// anchor re-projects as `#SPILL!` — Excel's behaviour, and the behaviour
    /// this repo's reference engine (`excel/excel-core-ts`) already had.
    /// `SheetError::SpillCellWrite` survives as a variant only because the WASM
    /// error mapping (frozen by INV-4) matches on it; no path returns it now.
    pub fn try_set_cell(&mut self, addr_str: &str, value: Value) -> Result<(), SheetError> {
        let addr = CellAddress::parse(addr_str).ok_or(SheetError::InvalidAddress)?;
        // ADR 0006 — one notification wave. A collapse is three store-visible
        // steps (withdraw the projection, land the write, re-project the anchor
        // as `#SPILL!`), and the middle of that sequence is a state no user
        // ever authored: the array gone but the anchor still claiming it. The
        // engine's batches nest (`Store::batch` counts depth and only the
        // outermost flushes), so an outer batch here folds the existing inner
        // one plus the trailing re-projection into a single publish.
        //
        // It is taken ONLY on the collapse path: batching every write would
        // move `try_release_primitive` and `cleanup_obsolete_formula_atoms_at`
        // inside the deferral for millions of unrelated writes, and their
        // ordering against propagation is load-bearing elsewhere. Writes that
        // touch no spill keep byte-identical notification timing.
        if self.spilled_into_anchor(addr).is_some() && !matches!(value, Value::Null) {
            return self.store_batch(|sheet| sheet.set_cell_inner(addr, value));
        }
        self.set_cell_inner(addr, value)
    }

    pub(super) fn set_cell_inner(&mut self, addr: CellAddress, value: Value) -> Result<(), SheetError> {
        // ADR 0006 stage 1 — a write into a spill projection cell withdraws the
        // whole array, EXCEPT when the incoming value could not have blocked it
        // in the first place. `Value::Null` is the only such value
        // (`is_target_occupied` treats a Null primitive as empty), so a Delete
        // over a ghost cell would collapse and then immediately re-install the
        // identical projection. Short-circuiting is therefore not an exception
        // to the rule but its fixpoint — and it is what keeps Delete over a
        // 100k-row spill from destroying and re-minting 100k derived atoms for
        // zero observable change. Excel and `excel/excel-core-ts`
        // (`workbook.ts` § "Spill semantics") both treat Delete over ghost
        // cells as a no-op for exactly this reason.
        let ghost_of = self.spilled_into_anchor(addr);
        if ghost_of.is_some() && matches!(value, Value::Null) {
            return Ok(());
        }
        let collapsed_anchor = ghost_of;
        // ADR 0006 stage 2 — anchors that are currently `#SPILL!` because
        // something occupies this address. Sampled BEFORE the write so the
        // claim is still registered; the retry re-runs the real collision test.
        let blocked_retries = self.blocked_anchors_claiming(addr);
        let pre_range_member = self.range_member_present(addr);
        // LAZY_FORMULA_INDEXING Phase 3: include unhydrated lazy
        // formulas. `remove_formula_record` already drains the lazy
        // entries defensively.
        let had_formula = self.interior.formula_cells.borrow().contains_key(&addr)
            || self.interior.needs_parse.borrow().contains(&addr);
        let is_null = matches!(value, Value::Null);
        // P4c: sample the inner-atom identity BEFORE the write so we can bump
        // the facade epoch only on an identity transition (see below).
        let pre_atom = self.slot_atom_id(addr);
        let same_display_value = if had_formula {
            // Formula replacement only needs the old displayed value for a
            // direct listener's same-value notification. Avoid hydrating an
            // otherwise cold formula solely for this comparison.
            self.has_address_subscribers(addr) && self.peek_value(addr) == value
        } else {
            self.cell_value_at(addr).unwrap_or(Value::Null) == value
        };
        let dependent_formulas =
            self.store_dependent_formula_addrs_from_addrs(std::iter::once(addr));
        let mut array_formulas_to_reproject: HashSet<CellAddress> = dependent_formulas
            .iter()
            .copied()
            .filter(|formula_addr| self.formula_needs_spill_maintenance(*formula_addr))
            .collect();
        // ADR 0006 stage 1 — the ONE new wire. The set above is built from
        // `addr`'s Store reverse dependents, but a spill's dependency runs the
        // other way: the projection cell's derived atom reads the ANCHOR, and
        // the anchor's formula never references its own projection cells. So
        // writing H3 can never select H1 through the Store, however the graph
        // is walked. `spill_target_anchor` is the only thing that knows.
        array_formulas_to_reproject.extend(collapsed_anchor);
        // ADR 0006 stage 2 — same idea in the blocked direction.
        array_formulas_to_reproject.extend(blocked_retries);

        self.store_batch(|sheet| {
            // ORDER RULE (ADR 0006 stage 1): the projection must be withdrawn
            // before anything below can call `ensure_cell` / `store.set` on
            // `addr`, or the write lands on a read-only derived atom and the
            // Store asserts.
            sheet.collapse_spill_for_write(addr);
            // If this address was itself a spill anchor, the new write
            // replaces the array — tear the spill down first so we don't
            // strand the derived atoms at the old targets.
            sheet.clear_spill_at_address(addr);
            debug_assert!(
                !sheet.spill_target_anchor.contains_key(&addr),
                "ADR 0006: {addr:?} must not be a spill projection cell once the write starts"
            );

            if had_formula {
                sheet.with_remap(addr, |sheet| {
                    sheet.remove_formula_record(addr);
                    sheet.interior.formula_source.borrow_mut().remove(&addr);
                    sheet.interior.needs_parse.borrow_mut().remove(&addr);
                    let id = sheet.ensure_cell(addr);
                    sheet.store.set(id, value);
                });
            } else {
                let id = sheet.ensure_cell(addr);
                sheet.attach_address_sub(addr);
                sheet.store.set(id, value);
            }
            // P4c: a same-id literal value update propagates via the facade's
            // native `args.get(inner)` edge (the `store.set(id, ..)` above is
            // part of this write batch) — no bump. Bump only on an identity
            // transition: a formula→literal replacement (`had_formula`) or a
            // Plain/Absent→Atom / Atom→None slot change (`pre_atom !=
            // post_atom`, the latter when `try_release_primitive` tore the slot
            // down).
            let post_atom = sheet.slot_atom_id(addr);
            if had_formula || pre_atom != post_atom {
                sheet.invalidate_formula_inner(addr);
                sheet.bump_facade_epoch(addr);
            }
            sheet.bump_range_epochs_if_membership_changed(addr, pre_range_member);
        });
        // Run primitive release after the write batch has settled. A subscribed
        // address has a stable facade edge to the primitive during the batch;
        // the release helper retargets that facade to Absent before destroying
        // the old backing atom.
        if is_null {
            self.try_release_primitive(addr);
        }
        if had_formula {
            self.cleanup_obsolete_formula_atoms_at(addr);
        }
        // Eager spill maintenance for downstream array formulas.
        self.recompute_array_formulas_in(&array_formulas_to_reproject);

        if !had_formula && same_display_value {
            for formula_addr in dependent_formulas {
                if formula_addr != addr && self.has_address_subscribers(formula_addr) {
                    self.notify_address_subscribers(formula_addr);
                }
            }
        }

        if had_formula && same_display_value && self.has_address_subscribers(addr) {
            self.notify_address_subscribers(addr);
        }
        Ok(())
    }
}
