//! 给求值器看的那份只读 Sheet 视图。
//!
//! 拆自 `sheet.rs`，是 `sheet` 的子模块 —— 照旧看得见 `Sheet` 的私有字段与私有
//! 方法。原来的私有项在这里写成 `pub(super)`，覆盖范围与它们留在 `sheet.rs`
//! 里时逐字相同。

use super::*;

pub(super) struct SheetEvalProvider<'a> {
    pub(super) sheet: &'a Sheet,
    /// Cell currently being evaluated. Updated through `set_current_cell`
    /// (save/restore guard pattern) so no-arg `ROW()` / `COLUMN()` calls can
    /// read the formula's own row/column.
    pub(super) current_cell: Cell<Option<CellAddress>>,
}

/// Collapse a `Value::Array` returned from a cell-read to its top-left
/// element so that scalar formula contexts see a scalar. Spilled cells
/// already return scalars via their derived atom; only the anchor cell
/// holds the underlying `Array`. Within formula eval we want
/// `=A1 + 1` (where A1 is a 3x1 spill anchor) to act on the top-left
/// element — Excel "implicit intersection" semantics. The `Sheet::get_cell`
/// / `peek_value` boundary intentionally still returns the raw `Array`
/// so the spill UI helpers (`spill_info`) can detect anchors.
pub(crate) fn collapse_array_for_eval(v: Value) -> Value {
    match v {
        Value::Array(arr) => arr.get(0, 0).cloned().unwrap_or(Value::Null),
        other => other,
    }
}

impl<'a> EvalProvider for SheetEvalProvider<'a> {
    fn cell(&self, addr: CellAddress) -> Value {
        collapse_array_for_eval(self.sheet.peek_value_with_provider(addr, self))
    }

    fn sheet_cell(&self, _sheet: &str, _addr: CellAddress) -> Value {
        Value::Error(ValueError::InvalidRef)
    }

    fn raw_cell(&self, addr: CellAddress) -> Value {
        self.sheet.peek_value_with_provider(addr, self)
    }

    fn raw_sheet_cell(&self, _sheet: &str, _addr: CellAddress) -> Value {
        Value::Error(ValueError::InvalidRef)
    }

    /// Sparse override: iterate only addresses that actually have a
    /// primitive or formula record, intersected with `range`. Lets
    /// `SUM(A:A)` walk the dozen real cells in column A instead of
    /// expanding the nominal column extent.
    ///
    /// Formula cells are read via `peek_value_with_provider(self)` so the
    /// current-cell guard is preserved across the sparse walk.
    fn for_each_range_cell(&self, range: CellRange, f: &mut dyn FnMut(CellAddress, Value)) {
        self.sheet.for_each_sparse_cell_with(
            range,
            &|sheet, addr| collapse_array_for_eval(sheet.peek_value_with_provider(addr, self)),
            f,
        );
    }

    fn current_cell(&self) -> Option<CellAddress> {
        self.current_cell.get()
    }

    fn set_current_cell(&self, addr: Option<CellAddress>) {
        self.current_cell.set(addr);
    }

    fn col_width(&self, col: u32) -> Option<u32> {
        self.sheet.col_width(col)
    }

    fn cell_has_formula(&self, addr: CellAddress) -> bool {
        self.sheet.has_formula_at(addr)
    }

    /// FORMULATEXT hook — consult the sheet's `formula_texts` map and
    /// return a clone of the stored source. A primitive cell has no
    /// entry → `None` → the FORMULATEXT arm surfaces `#N/A`.
    fn cell_formula_text(&self, addr: CellAddress) -> Option<String> {
        // LAZY_FORMULA_INDEXING Phase 3: prefer hydrated source, fall
        // back to lazy `formula_source`.
        if let Some(t) = self.sheet.interior.formula_texts.borrow().get(&addr) {
            return Some(t.clone());
        }
        self.sheet
            .interior
            .formula_source
            .borrow()
            .get(&addr)
            .map(|s| s.source.as_ref().to_string())
    }
}
