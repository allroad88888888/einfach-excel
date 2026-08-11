//! workbook read operations.

use super::*;

impl Workbook {
    pub fn get_cell(&self, sheet_name: &str, addr_str: &str) -> Value {
        let idx = match self.index_of(sheet_name) {
            Some(i) => i,
            None => return Value::Null,
        };
        let addr = match CellAddress::parse(addr_str) {
            Some(a) => a,
            None => return Value::Null,
        };

        let provider = WorkbookEvalProvider {
            wb: self,
            current: Cell::new(idx),
            current_cell: Cell::new(None),
        };
        let value = self.sheets[idx].peek_value_with_provider(addr, &provider);
        // Match Sheet::get_cell's public read boundary. All workbook sheets
        // share this Store, so one flush settles same- and cross-sheet reads.
        self.store.settle_pending_reads();
        value
    }

    /// Sparse read over one sheet range in workbook context.
    ///
    /// Only non-empty primitive/formula cells inside `range` are visited.
    /// Formula cells resolve through their Store facades, so cross-sheet
    /// references behave the same as `Workbook::get_cell`.
    pub fn for_each_sparse_range_cell(
        &self,
        sheet_idx: usize,
        range: CellRange,
        mut f: impl FnMut(CellAddress, Value),
    ) {
        let Some(sheet) = self.sheets.get(sheet_idx) else {
            return;
        };
        let provider = WorkbookEvalProvider {
            wb: self,
            current: Cell::new(sheet_idx),
            current_cell: Cell::new(None),
        };
        sheet.for_each_sparse_cell_with(
            range,
            &|sheet, addr| sheet.peek_value_with_provider(addr, &provider),
            &mut f,
        );
        // Same read boundary as `Workbook::get_cell` above. This path is the
        // viewport projection's read (`WasmWorkbook::read_sparse_range`), and
        // it EVALUATES the formulas it visits — a whole-column aggregate here
        // hydrates every cell of its range into `pending`. Without settling,
        // that debt is inherited by whatever mutates next: the user's first
        // edit after a bulk import paid a `flush_pending` proportional to the
        // entire imported sheet (minutes on a 100k-row sheet, and every later
        // edit was instant because the queue was already drained).
        self.store.settle_pending_reads();
    }

    #[doc(hidden)]
    pub fn debug_formula_cache_state(&self, sheet_idx: usize, addr_str: &str) -> &'static str {
        self.sheets
            .get(sheet_idx)
            .map(|sheet| sheet.debug_formula_cache_state(addr_str))
            .unwrap_or("missing-sheet")
    }

    /// Live sheet-owned core atoms. Exposed at the workbook level so the E3
    /// suite can assert the negative that matters: a whole `apply_filter`
    /// materializes NO atom, which is how "the derived filter set is not a
    /// derived atom, and the scan registers no dependency edge" is checked
    /// directly rather than inferred.
    #[doc(hidden)]
    pub fn debug_total_atom_count(&self, sheet_idx: usize) -> usize {
        self.sheets
            .get(sheet_idx)
            .map(Sheet::debug_total_atom_count)
            .unwrap_or(0)
    }

    #[doc(hidden)]
    pub fn debug_formula_eval_count(&self, sheet_idx: usize) -> usize {
        self.sheets
            .get(sheet_idx)
            .map(|sheet| sheet.debug_formula_eval_count())
            .unwrap_or(0)
    }
}
