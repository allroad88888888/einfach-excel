//! workbook eval provider implementation.

use super::*;

impl Default for Workbook {
    fn default() -> Self {
        Self::new()
    }
}

pub(crate) struct WorkbookEvalProvider<'a> {
    pub(crate) wb: &'a Workbook,
    pub(crate) current: Cell<usize>,
    /// Cell currently being evaluated. Mirrors `SheetEvalProvider`; evaluator
    /// save/restore calls keep no-arg `ROW()` / `COLUMN()` anchored to the
    /// current expression when this compatibility provider is used.
    pub(crate) current_cell: Cell<Option<CellAddress>>,
}

impl<'a> WorkbookEvalProvider<'a> {
    fn with_current<T>(&self, idx: usize, f: impl FnOnce() -> T) -> T {
        struct CurrentGuard<'a> {
            current: &'a Cell<usize>,
            prev: usize,
        }
        impl Drop for CurrentGuard<'_> {
            fn drop(&mut self) {
                self.current.set(self.prev);
            }
        }

        let prev = self.current.replace(idx);
        let _guard = CurrentGuard {
            current: &self.current,
            prev,
        };
        f()
    }
}

impl<'a> EvalProvider for WorkbookEvalProvider<'a> {
    fn cell(&self, addr: CellAddress) -> Value {
        let idx = self.current.get();
        crate::sheet::collapse_array_for_eval(
            self.wb.sheets[idx].peek_value_with_provider(addr, self),
        )
    }

    fn sheet_cell(&self, sheet: &str, addr: CellAddress) -> Value {
        let Some(idx) = self.wb.by_name.get(sheet).copied() else {
            return Value::Error(ValueError::InvalidRef);
        };
        self.with_current(idx, || {
            crate::sheet::collapse_array_for_eval(
                self.wb.sheets[idx].peek_value_with_provider(addr, self),
            )
        })
    }

    fn raw_cell(&self, addr: CellAddress) -> Value {
        let idx = self.current.get();
        self.wb.sheets[idx].peek_value_with_provider(addr, self)
    }

    fn raw_sheet_cell(&self, sheet: &str, addr: CellAddress) -> Value {
        let Some(idx) = self.wb.by_name.get(sheet).copied() else {
            return Value::Error(ValueError::InvalidRef);
        };
        self.with_current(idx, || {
            self.wb.sheets[idx].peek_value_with_provider(addr, self)
        })
    }

    /// Sparse override for the workbook context. Routes the formula-cell
    /// read through `peek_value_with_provider` so cross-sheet references
    /// inside formulas in the iterated range can still resolve through
    /// the workbook chain (the single-sheet `peek_value` would return
    /// `#REF!` for `Sheet2!A1`).
    fn for_each_range_cell(&self, range: CellRange, f: &mut dyn FnMut(CellAddress, Value)) {
        let idx = self.current.get();
        let sheet = &self.wb.sheets[idx];
        sheet.for_each_sparse_cell_with(
            range,
            &|sheet, addr| {
                crate::sheet::collapse_array_for_eval(sheet.peek_value_with_provider(addr, self))
            },
            f,
        );
    }

    fn for_each_sheet_range_cell(
        &self,
        sheet: &str,
        range: CellRange,
        f: &mut dyn FnMut(CellAddress, Value),
    ) {
        let Some(idx) = self.wb.by_name.get(sheet).copied() else {
            f(
                range.normalize().start,
                Value::Error(ValueError::InvalidRef),
            );
            return;
        };
        self.with_current(idx, || {
            let target_sheet = &self.wb.sheets[idx];
            target_sheet.for_each_sparse_cell_with(
                range,
                &|sheet, addr| {
                    crate::sheet::collapse_array_for_eval(
                        sheet.peek_value_with_provider(addr, self),
                    )
                },
                f,
            );
        });
    }

    fn current_cell(&self) -> Option<CellAddress> {
        self.current_cell.get()
    }

    fn set_current_cell(&self, addr: Option<CellAddress>) {
        self.current_cell.set(addr);
    }

    fn col_width(&self, col: u32) -> Option<u32> {
        // The currently-evaluating sheet's explicit width for `col`, if any —
        // consumed by `CELL("width")` on the eager workbook eval path
        // (`get_cell`, `define_name`). Cross-sheet `CELL("width", Other!A1)`
        // collapses to this sheet, matching the content-touching info_types.
        self.wb.sheets[self.current.get()].col_width(col)
    }

    fn lookup_named(&self, name: &str) -> Option<Value> {
        // Delegate to the workbook's case-insensitive registry. Returns
        // a clone of the stored value (cheap for `Value::Lambda`, which
        // wraps an `Arc<dyn LambdaValue>`; constant-time for scalars).
        self.wb.get_named(name)
    }

    fn lookup_table(&self, name: Option<&str>) -> Option<ResolvedTable> {
        // Eager workbook provider (get_cell of a non-formula cell,
        // define_name evaluation): read the registry directly (design doc
        // #32 §5.3). The live formula-inner path goes through
        // `AtomFormulaProvider::lookup_table` instead.
        match name {
            Some(n) => {
                let entry = self.wb.tables.get(&n.to_ascii_uppercase())?;
                let sheet_index = self.wb.by_name.get(&entry.sheet_name).copied()?;
                Some(entry.to_resolved(sheet_index))
            }
            None => {
                let addr = self.current_cell.get()?;
                let sheet_index = self.current.get();
                let sheet_name = self.wb.names.get(sheet_index)?;
                self.wb
                    .tables
                    .values()
                    .find(|t| &t.sheet_name == sheet_name && t.range.contains(addr))
                    .map(|t| t.to_resolved(sheet_index))
            }
        }
    }

    fn cell_has_formula(&self, addr: CellAddress) -> bool {
        let idx = self.current.get();
        self.wb
            .sheets
            .get(idx)
            .map(|s| s.has_formula_at(addr))
            .unwrap_or(false)
    }

    fn sheet_cell_has_formula(&self, sheet: &str, addr: CellAddress) -> bool {
        let Some(idx) = self.wb.by_name.get(sheet).copied() else {
            return false;
        };
        self.wb
            .sheets
            .get(idx)
            .map(|s| s.has_formula_at(addr))
            .unwrap_or(false)
    }

    /// FORMULATEXT hook for the workbook context. Looks up the source
    /// formula in the *current* sheet's text store. Returns `None` when
    /// the cell holds a primitive — the FORMULATEXT arm then surfaces
    /// `#N/A`.
    fn cell_formula_text(&self, addr: CellAddress) -> Option<String> {
        let idx = self.current.get();
        let sheet = self.wb.sheets.get(idx)?;
        sheet.formula_text_at(addr)
    }

    /// Cross-sheet variant: resolve the sheet by name first.
    fn sheet_cell_formula_text(&self, sheet: &str, addr: CellAddress) -> Option<String> {
        let idx = self.wb.by_name.get(sheet).copied()?;
        let target = self.wb.sheets.get(idx)?;
        target.formula_text_at(addr)
    }

    fn current_sheet_index(&self) -> Option<usize> {
        Some(self.current.get())
    }

    fn sheet_index_of(&self, name: &str) -> Option<usize> {
        self.wb.by_name.get(name).copied()
    }

    fn hidden_rows(&self, sheet_index: Option<usize>) -> Option<Rc<HashSet<u32>>> {
        // Eager provider (define_name / non-formula get_cell eval): read the
        // host-pushed hidden set untracked (this path holds no reactive edge,
        // design doc #32 §6.2). The live formula-inner path is
        // `AtomFormulaProvider::hidden_rows`.
        self.wb.atom_context.hidden_rows_untracked(sheet_index?)
    }

    fn filter_hidden_rows(&self, sheet_index: Option<usize>) -> Option<Rc<HashSet<u32>>> {
        // Untracked twin of `hidden_rows` against the filter side store
        // (`design-filter-hidden-rows` §6.2).
        self.wb
            .atom_context
            .filter_hidden_rows_untracked(sheet_index?)
    }

    fn sheet_count(&self) -> usize {
        self.wb.sheets.len()
    }

    /// Wave 8 host custom-formula dispatch. Consult the workbook's
    /// registry handle if one was installed via
    /// `Workbook::set_custom_function_registry`; otherwise the
    /// `EvalProvider` default `None` keeps the legacy `#NAME?`
    /// fallthrough.
    ///
    /// Brackets the JS callback in a `CustomCallScope` so the workbook's
    /// re-entrancy depth counter ticks for the duration. Any mutation
    /// the callback attempts via `wb.set_cell(...)` / `wb.set_formula
    /// (...)` / etc. is rejected via the per-entry-point
    /// `is_inside_custom_call` guard. The scope's `Drop` impl is
    /// exception-safe (matches the wasm-bindgen `throw_str` path).
    fn call_custom(&self, name: &str, args: &[Value]) -> Option<Value> {
        let registry = self.wb.custom_functions.as_ref()?;
        if registry.is_async(name) {
            // Eager, non-reactive path (define_name evaluation): there is
            // no ReadArgs to hang a pending-result dependency on, so an
            // async call can never settle into this frame. Surface #BUSY!
            // directly; async names in defined-name formulas are
            // unsupported (see CUSTOM_FORMULAS.md).
            return Some(Value::Error(ValueError::Busy));
        }
        let _scope = CustomCallScope::enter(self.wb.custom_call_depth_cell());
        registry.lookup(name, args)
    }
}
