//! Sheet 的单元格值、公式文本与 atom 读取入口。

use super::*;

impl Sheet {
    /// Get a cell's value by address string.
    /// Returns the formula result if the cell has a formula, otherwise the raw value.
    /// Returns Null for cells that haven't been set.

    pub fn get_cell(&self, addr_str: &str) -> Value {
        let addr = CellAddress::parse(addr_str).expect("invalid cell address");
        let value = self.peek_value(addr);
        // A bare Store read intentionally parks newly-computed derived states
        // in pending. Public engine reads are transaction boundaries: settle
        // those states now so an unrelated later write does not inherit work
        // proportional to every formula read since the previous mutation.
        self.store.settle_pending_reads();
        value
    }

    /// Read a cell's current value without creating any atoms. Returns
    /// `Value::Null` for cells that haven't been touched. Used by the
    /// Workbook layer (cross-sheet read) so it can stay `&self`.
    pub fn peek_value(&self, addr: CellAddress) -> Value {
        let provider = SheetEvalProvider {
            sheet: self,
            current_cell: Cell::new(None),
        };
        self.peek_value_with_provider(addr, &provider)
    }

    pub(crate) fn peek_value_with_provider(
        &self,
        addr: CellAddress,
        _provider: &dyn EvalProvider,
    ) -> Value {
        // LAZY_FORMULA_INDEXING Phase 3: hydrate before the
        // `formula_cells` / `cells` branch decision so an unhydrated
        // formula at `addr` doesn't fall through to
        // `primitive_value_at` (which would return whatever stale
        // primitive scaffold the bulk-load left behind). Hydration is
        // idempotent and `&self`-only via internal `RefCell`s.
        self.hydrate_formula(addr);
        let formula = self.interior.formula_cells.borrow().get(&addr).cloned();
        if formula.is_some() {
            let facade = self.facade_of(addr);
            return self.store.get(facade);
        }
        self.cell_value_at(addr).unwrap_or(Value::Null)
    }

    /// Get the AtomId for a cell (creating if needed).
    pub fn cell_atom(&mut self, addr_str: &str) -> AtomId {
        let addr = CellAddress::parse(addr_str).expect("invalid cell address");
        self.readable_atom(addr)
    }

    /// Return the original formula text for a cell, or `None` if the cell
    /// holds a value rather than a formula. Required by the formula bar /
    /// double-click-to-edit flow so users see `=A1*2` instead of the
    /// computed result `20` (D.11).
    ///
    /// Takes `&str` so callers can reuse the same address strings. Doesn't
    /// require `&mut self` because no atom creation is involved.
    pub fn get_formula(&self, addr_str: &str) -> Option<String> {
        let addr = CellAddress::parse(addr_str)?;
        // LAZY_FORMULA_INDEXING Phase 3: hydrated formulas live in
        // `formula_texts`, lazy ones live in `formula_source`. Check
        // both so the formula bar shows the source even before first
        // read.
        if let Some(t) = self.interior.formula_texts.borrow().get(&addr) {
            return Some(t.clone());
        }
        self.interior
            .formula_source
            .borrow()
            .get(&addr)
            .map(|s| s.source.as_ref().to_string())
    }

    /// Is there a formula at `addr`? Used by `ISFORMULA(reference)` via
    /// the `EvalProvider::cell_has_formula` hook.
    pub fn has_formula_at(&self, addr: CellAddress) -> bool {
        // LAZY_FORMULA_INDEXING Phase 3: lazy formulas are still
        // formulas — ISFORMULA must observe them.
        self.interior.formula_cells.borrow().contains_key(&addr)
            || self.interior.needs_parse.borrow().contains(&addr)
    }

    /// Source formula text at `addr`, if any. Used by
    /// `FORMULATEXT(reference)` via the `EvalProvider::cell_formula_text`
    /// hook. Returns a clone of the stored source (leading `=`
    /// included) — the cost is bounded by the formula length, so cloning
    /// per call is acceptable for the formula-bar / `FORMULATEXT` use
    /// case.
    pub fn formula_text_at(&self, addr: CellAddress) -> Option<String> {
        if let Some(t) = self.interior.formula_texts.borrow().get(&addr) {
            return Some(t.clone());
        }
        self.interior
            .formula_source
            .borrow()
            .get(&addr)
            .map(|s| s.source.as_ref().to_string())
    }
}
