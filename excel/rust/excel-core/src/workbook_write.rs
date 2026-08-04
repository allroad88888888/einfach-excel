//! workbook write operations.

use super::*;

impl Workbook {
    pub fn set_formula(&mut self, sheet_idx: usize, addr_str: &str, formula_text: &str) -> bool {
        if self.is_inside_custom_call() {
            return false; // re-entrancy guard; see `set_cell` for rationale
        }
        if sheet_idx >= self.sheets.len() {
            return false;
        }
        let addr = match CellAddress::parse(addr_str) {
            Some(a) => a,
            None => return false,
        };

        let array_dependents = self.cross_sheet_array_dependents_for_addr(sheet_idx, addr);

        // Parse first so the workbook-wide static cycle walk can inspect the
        // candidate. The sheet remains the canonical parse-error write path.
        let expr = match parse_formula(formula_text) {
            Some(e) => e,
            None => {
                self.sheets[sheet_idx].set_formula(addr_str, formula_text);
                self.recompute_array_formula_groups(array_dependents);
                return false;
            }
        };

        if self.closes_workbook_cycle(sheet_idx, addr, &expr) {
            self.sheets[sheet_idx].write_error(addr, ValueError::CyclicRef);
            self.recompute_array_formula_groups(array_dependents);
            return false;
        }

        let ok = self.sheets[sheet_idx].set_formula(addr_str, formula_text);
        self.recompute_array_formula_groups(array_dependents);
        ok
    }

    /// Workbook-routed cell write. The target sheet's source atom belongs to
    /// the workbook-scoped Store, so materialized same- and cross-sheet
    /// formulas rederive through their normal dynamic dependencies.
    pub fn set_cell(&mut self, sheet_idx: usize, addr_str: &str, value: Value) {
        if self.is_inside_custom_call() {
            // Re-entrancy guard (Wave 8). A custom-formula JS callback
            // attempted to write through the workbook while the engine
            // was still inside its eval frame. Swallow the mutation
            // silently — the infallible `set_cell` signature can't
            // return an error. Hosts that need the rejection should use
            // `try_set_cell`, which surfaces it via `SheetError`.
            return;
        }
        if sheet_idx >= self.sheets.len() {
            return;
        }
        let Some(addr) = CellAddress::parse(addr_str) else {
            return;
        };
        let array_dependents = self.cross_sheet_array_dependents_for_addr(sheet_idx, addr);
        self.sheets[sheet_idx].set_cell(addr_str, value);
        self.recompute_array_formula_groups(array_dependents);
    }

    /// Workbook-routed cell clear. Equivalent to `set_cell(idx, addr,
    /// Value::Null)` and provided separately for Delete-key UX.
    pub fn clear_cell(&mut self, sheet_idx: usize, addr_str: &str) {
        if self.is_inside_custom_call() {
            return; // re-entrancy guard; see `set_cell` for rationale
        }
        if sheet_idx >= self.sheets.len() {
            return;
        }
        let Some(addr) = CellAddress::parse(addr_str) else {
            return;
        };
        let array_dependents = self.cross_sheet_array_dependents_for_addr(sheet_idx, addr);
        self.sheets[sheet_idx].clear_cell(addr_str);
        self.recompute_array_formula_groups(array_dependents);
    }

    /// Fallible variant of `set_cell`. Mirrors `Sheet::try_set_cell`.
    /// Writes propagate through the same workbook Store as `set_cell`.
    ///
    /// ADR 0006 stage 1: a write into a spill region no longer fails — it
    /// lands and withdraws the array. What remains fallible here is
    /// `InvalidAddress` and `MutationDuringCustomCall`.
    pub fn try_set_cell(
        &mut self,
        sheet_idx: usize,
        addr_str: &str,
        value: Value,
    ) -> Result<(), SheetError> {
        if self.is_inside_custom_call() {
            return Err(SheetError::MutationDuringCustomCall);
        }
        if sheet_idx >= self.sheets.len() {
            return Err(SheetError::InvalidAddress);
        }
        let addr = CellAddress::parse(addr_str).ok_or(SheetError::InvalidAddress)?;
        let array_dependents = self.cross_sheet_array_dependents_for_addr(sheet_idx, addr);
        self.sheets[sheet_idx].try_set_cell(addr_str, value)?;
        self.recompute_array_formula_groups(array_dependents);
        Ok(())
    }

    /// Fallible variant of `clear_cell`. Mirrors `Sheet::try_clear_cell`.
    ///
    /// ADR 0006 stage 1: clearing a spill projection cell is inert (Excel
    /// treats Delete over ghost cells as a no-op) and reports `Ok`.
    pub fn try_clear_cell(&mut self, sheet_idx: usize, addr_str: &str) -> Result<(), SheetError> {
        if self.is_inside_custom_call() {
            return Err(SheetError::MutationDuringCustomCall);
        }
        if sheet_idx >= self.sheets.len() {
            return Err(SheetError::InvalidAddress);
        }
        let addr = CellAddress::parse(addr_str).ok_or(SheetError::InvalidAddress)?;
        let array_dependents = self.cross_sheet_array_dependents_for_addr(sheet_idx, addr);
        self.sheets[sheet_idx].try_clear_cell(addr_str)?;
        self.recompute_array_formula_groups(array_dependents);
        Ok(())
    }

    /// Fallible variant of `set_formula`. Mirrors `Sheet::try_set_formula`
    /// and routes through workbook-wide cycle validation. Returns:
    ///   - `Ok(true)`  — formula parsed and installed.
    ///   - `Ok(false)` — formula parse failed (`#VALUE!`) or cycle (`#CYCLE!`).
    ///   - `Err(InvalidAddress)` — address parse or out-of-range sheet index.
    ///
    /// ADR 0006 stage 1: the up-front `is_spilled` pre-check this used to run
    /// is gone. It existed to surface `SpillCellWrite` before the write, and
    /// it did so by delegating to `Sheet::try_set_formula` DIRECTLY — bypassing
    /// the workbook-wide cycle validation that the normal path applies. With
    /// the rejection retired, both problems go away together: every formula
    /// now takes the one validated route.
    pub fn try_set_formula(
        &mut self,
        sheet_idx: usize,
        addr_str: &str,
        formula_text: &str,
    ) -> Result<bool, SheetError> {
        if self.is_inside_custom_call() {
            return Err(SheetError::MutationDuringCustomCall);
        }
        if sheet_idx >= self.sheets.len() {
            return Err(SheetError::InvalidAddress);
        }
        CellAddress::parse(addr_str).ok_or(SheetError::InvalidAddress)?;
        Ok(self.set_formula(sheet_idx, addr_str, formula_text))
    }

    /// Look up the spill anchor for a non-anchor spilled cell on the
    /// given sheet. Returns `None` for plain cells, anchor cells, or
    /// out-of-range sheet indexes. Used by the JS UI to draw the
    /// spill outline around the anchor's bounding rectangle even when
    /// the anchor itself is outside the visible window.
    pub fn spill_anchor(&self, sheet_idx: usize, addr_str: &str) -> Option<CellAddress> {
        let sheet = self.sheets.get(sheet_idx)?;
        let addr = CellAddress::parse(addr_str)?;
        sheet.spill_anchor_for(addr)
    }

    /// 诊断查询：`addr_str` 若是碰撞态（`#SPILL!`）锚点，回答行主序第一个挡住它的
    /// 格子。语义与上限见 `sheet_spill_blocker.rs`；表号越界、地址非法一律 `None`。
    pub fn spill_blocker(&self, sheet_idx: usize, addr_str: &str) -> Option<CellAddress> {
        let sheet = self.sheets.get(sheet_idx)?;
        let addr = CellAddress::parse(addr_str)?;
        sheet.spill_blocker(addr)
    }

    fn cross_sheet_array_dependents_for_addr(
        &self,
        source_sheet: usize,
        addr: CellAddress,
    ) -> Vec<(usize, HashSet<CellAddress>)> {
        let roots = self.sheets[source_sheet].store_root_atoms_for_addr(addr);
        let dependent_atoms = self.store.reverse_dependents(&roots);
        self.sheets
            .iter()
            .enumerate()
            .filter(|(sheet_idx, _)| *sheet_idx != source_sheet)
            .filter_map(|(sheet_idx, sheet)| {
                let addrs = sheet.array_formula_addrs_for_store_atoms(&dependent_atoms);
                (!addrs.is_empty()).then_some((sheet_idx, addrs))
            })
            .collect()
    }

    pub(crate) fn recompute_array_formula_groups(
        &mut self,
        groups: Vec<(usize, HashSet<CellAddress>)>,
    ) {
        for (sheet_idx, addrs) in groups {
            if let Some(sheet) = self.sheets.get_mut(sheet_idx) {
                sheet.recompute_array_formulas_in(&addrs);
            }
        }
    }

    /// Clear every non-empty cell inside a range without materializing
    /// every address in that range. The metadata scan is sparse and does
    /// not evaluate formulas; `bulk_load` coalesces all Store propagation.
    pub fn clear_range(&mut self, sheet_idx: usize, range: CellRange) -> usize {
        let Some(sheet) = self.sheets.get(sheet_idx) else {
            return 0;
        };
        let mut addrs: Vec<CellAddress> = Vec::new();
        sheet.for_each_non_empty_in_range(range, |addr| {
            addrs.push(addr);
        });
        let count = addrs.len();
        self.bulk_load(|loader| {
            for addr in addrs {
                // Typed entry (AUDIT A-9): no `to_string` → re-parse
                // round trip per cleared cell.
                loader.clear_cell_at(sheet_idx, addr);
            }
        });
        count
    }
}
