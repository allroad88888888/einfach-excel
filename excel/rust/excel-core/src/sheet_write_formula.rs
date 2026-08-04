//! 把一条公式装进格子（装不成时落成错误值）。
//!
//! 拆自 `sheet.rs`，是 `sheet` 的子模块 —— 照旧看得见 `Sheet` 的私有字段与私有
//! 方法。原来的私有项在这里写成 `pub(super)`，覆盖范围与它们留在 `sheet.rs`
//! 里时逐字相同。

use super::*;

impl Sheet {
    /// Set a cell's formula by address string (e.g. "=A1+B1").
    /// The formula is parsed and stored as a lazy Sheet-level record. It is
    /// not evaluated until the cell is read.
    ///
    /// Returns `false` if either:
    ///   - the formula failed to parse (B.3) — cell becomes `#VALUE!`
    ///   - the formula would form a dependency cycle (B.2) — cell becomes `#CYCLE!`
    /// In both cases the wasm instance keeps running and any prior formula on
    /// this cell is cleared.
    ///
    pub fn set_formula(&mut self, addr_str: &str, formula_str: &str) -> bool {
        match self.try_set_formula(addr_str, formula_str) {
            Ok(success) => success,
            // Only `InvalidAddress` reaches here now (ADR 0006 stage 1 retired
            // the spill rejection). Mapping it to `false` matches the legacy
            // contract: callers that ignore the error see a no-value-change
            // write, exactly as for a parse / cycle failure.
            Err(_) => false,
        }
    }

    /// Fallible variant of `set_formula`. Returns:
    ///   - `Ok(true)` — formula parsed and installed.
    ///   - `Ok(false)` — formula failed to parse or would create a cycle.
    ///     The cell is now `#VALUE!` or `#CYCLE!` respectively (existing
    ///     behavior preserved).
    ///   - `Err(InvalidAddress)` — address parse failure.
    ///
    /// ADR 0006 stage 1: a formula aimed at a spill projection cell installs
    /// (a formula always blocks a spill), withdrawing the array and leaving its
    /// anchor at `#SPILL!`. `SheetError::SpillCellWrite` is no longer returned.
    pub fn try_set_formula(
        &mut self,
        addr_str: &str,
        formula_str: &str,
    ) -> Result<bool, SheetError> {
        let addr = CellAddress::parse(addr_str).ok_or(SheetError::InvalidAddress)?;
        // One notification wave — see `try_set_cell` for the reasoning. Also
        // covers the two `write_error` early exits below, which mutate `addr`
        // too.
        if self.spilled_into_anchor(addr).is_some() {
            return self.store_batch(|sheet| sheet.set_formula_inner(addr, formula_str));
        }
        self.set_formula_inner(addr, formula_str)
    }

    pub(super) fn set_formula_inner(
        &mut self,
        addr: CellAddress,
        formula_str: &str,
    ) -> Result<bool, SheetError> {
        // ADR 0006 stage 1 — no `Value::Null` escape hatch here: a formula
        // cell always blocks a spill (`is_target_occupied` probes
        // `formula_cells` / `needs_parse` regardless of the value it computes),
        // so there is no incoming content for which collapsing would be a
        // no-op round trip.
        let collapsed_anchor = self.spilled_into_anchor(addr);
        // ADR 0006 stage 2 — see `set_cell_inner`.
        let blocked_retries = self.blocked_anchors_claiming(addr);
        let pre_range_member = self.range_member_present(addr);

        let expr = match parse_formula(formula_str) {
            Some(e) => e,
            None => {
                // `write_error` runs the same ADR 0006 collapse + re-projection
                // itself, so the two failure exits need nothing extra here.
                self.write_error(addr, ValueError::InvalidValue);
                return Ok(false);
            }
        };

        // Static cycle check (B.2). Walk referenced formula AST/source content
        // on demand to see if `addr` is reachable; no reverse graph is kept.
        if self.closes_local_cycle(addr, &expr) {
            self.write_error(addr, ValueError::CyclicRef);
            return Ok(false);
        }
        let mut array_formulas_to_reproject =
            self.store_dependent_array_formula_addrs_from_addrs(std::iter::once(addr));
        array_formulas_to_reproject.extend(collapsed_anchor);
        array_formulas_to_reproject.extend(blocked_retries);

        self.store_batch(|sheet| {
            // ORDER RULE (ADR 0006 stage 1) — see `set_cell_inner`.
            sheet.collapse_spill_for_write(addr);
            // Replacing the cell at this address: tear down any spill the
            // previous content (if it was an anchor) installed.
            sheet.clear_spill_at_address(addr);
            debug_assert!(
                !sheet.spill_target_anchor.contains_key(&addr),
                "ADR 0006: {addr:?} must not be a spill projection cell once the write starts"
            );

            sheet.with_remap(addr, move |sheet| {
                let expr = Rc::new(expr);
                let deps = Sheet::formula_deps_for(&expr);
                let static_ranges = collect_range_refs(&expr);
                sheet.remove_formula_record(addr);
                sheet.drop_cell_slot(addr);
                sheet.bump_formula_topology_epoch();
                let record = Rc::new(FormulaRecord::new(expr.clone(), deps, static_ranges));
                sheet
                    .interior
                    .formula_cells
                    .borrow_mut()
                    .insert(addr, record);
                sheet
                    .interior
                    .formula_exprs
                    .borrow_mut()
                    .insert(addr, expr.clone());
                sheet
                    .interior
                    .formula_texts
                    .borrow_mut()
                    .insert(addr, formula_str.to_string());
                sheet.materialize_formula_inner(addr);
            });
            // P4c: force the facade to re-derive off the NEW formula. A
            // formula-content edit (`=B1`→`=C1`) whose upstream deps are unchanged
            // leaves the inner atom's recorded edges fresh, so it would return the
            // cached old-AST value — `invalidate_formula_inner` marks it stale and
            // the epoch bump drives the facade to re-read (and thus re-run) it.
            // literal→formula / absent→formula create the inner lazily on that
            // re-derive; `invalidate_formula_inner` is a no-op there. Inert until
            // the read口 flip.
            sheet.invalidate_formula_inner(addr);
            sheet.bump_facade_epoch(addr);
            sheet.bump_range_epochs_if_membership_changed(addr, pre_range_member);
        });
        // Eager spill maintenance: re-evaluate the just-installed
        // formula (and any downstream array formulas) and install /
        // tear down spill state. The lazy `peek_value` read path can't
        // mutate the sheet, so the spill install has to happen here.
        self.recompute_array_formula(addr);
        self.recompute_array_formulas_in(&array_formulas_to_reproject);
        Ok(true)
    }

    /// Drop any existing formula and write an error value to the cell.
    /// `pub(crate)` so the workbook layer can route a cross-sheet cycle
    /// detection failure (`#CYCLE!`) to the target cell without re-deriving
    /// the helper logic here.
    pub(crate) fn write_error(&mut self, addr: CellAddress, err: ValueError) {
        // ADR 0006 stage 1 — this is a mutation entry point in its own right
        // (`try_set_formula`'s parse / cycle exits, and `Workbook`'s cross-sheet
        // cycle routing), so it carries the same collapse. `Value::Error` is
        // non-Null and therefore blocks a spill, so there is no inert case.
        if self.spilled_into_anchor(addr).is_some() {
            return self.store_batch(|sheet| sheet.write_error_inner(addr, err));
        }
        self.write_error_inner(addr, err)
    }

    pub(super) fn write_error_inner(&mut self, addr: CellAddress, err: ValueError) {
        let collapsed_anchor = self.spilled_into_anchor(addr);
        let blocked_retries = self.blocked_anchors_claiming(addr);
        let pre_range_member = self.range_member_present(addr);
        // LAZY_FORMULA_INDEXING Phase 3: unhydrated formulas count as
        // "had a formula" for the remap-vs-direct teardown decision.
        let had_formula = self.interior.formula_cells.borrow().contains_key(&addr)
            || self.interior.needs_parse.borrow().contains(&addr);
        // P4c: sample inner-atom identity BEFORE the write, mirroring
        // try_set_cell — bump the facade only on an identity transition.
        let pre_atom = self.slot_atom_id(addr);
        let mut array_formulas_to_reproject =
            self.store_dependent_array_formula_addrs_from_addrs(std::iter::once(addr));
        array_formulas_to_reproject.extend(collapsed_anchor);
        array_formulas_to_reproject.extend(blocked_retries);
        self.store_batch(|sheet| {
            // ORDER RULE (ADR 0006 stage 1) — see `set_cell_inner`.
            sheet.collapse_spill_for_write(addr);
            sheet.clear_spill_at_address(addr);
            if had_formula {
                sheet.with_remap(addr, |sheet| {
                    sheet.remove_formula_record(addr);
                    let id = sheet.ensure_cell(addr);
                    sheet.store.set(id, Value::Error(err.clone()));
                });
            } else {
                let id = sheet.ensure_cell(addr);
                sheet.attach_address_sub(addr);
                sheet.store.set(id, Value::Error(err));
            }
            sheet.bump_range_epochs_if_membership_changed(addr, pre_range_member);
            // P4c: after write_error the cell is no longer a formula — the facade
            // re-derives `is_formula=false` and reads the literal error. Bump on a
            // formula→error replacement (`had_formula`) or a slot identity change
            // (`pre_atom != post_atom`).
            let post_atom = sheet.slot_atom_id(addr);
            if had_formula || pre_atom != post_atom {
                sheet.invalidate_formula_inner(addr);
                sheet.bump_facade_epoch(addr);
            }
        });
        if had_formula {
            self.cleanup_obsolete_formula_atoms_at(addr);
        }
        self.recompute_array_formulas_in(&array_formulas_to_reproject);
    }
}
