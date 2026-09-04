//! 公式 atom 求值期间的响应式数据读取器。

use super::*;

/// On-stack [`EvalProvider`] for a formula-inner read_fn (P4c). Every cell /
/// range lookup resolves through the facade family and is issued as a tracked
/// `ReadArgs::get`, so the enclosing formula-inner atom's dependency edges are
/// exactly the cells the formula reads — the store's `dependenciesMap` is the
/// single response graph (INV-2), no address→formula index. Mirrors
/// [`SheetEvalProvider`]'s method bodies, but reads go through `read_facade`
/// instead of `Sheet::peek_value_with_provider`.
///
/// Lifetimes: `'a` is the borrow of the live [`ReadArgs`] handed to the
/// read_fn; `'r` is that `ReadArgs`'s own store-inner borrow.
pub(super) struct AtomFormulaProvider<'a, 'r> {
    pub(super) args: &'a ReadArgs<'r>,
    pub(super) ctx: FacadeCtx,
    /// Cell currently being evaluated (for no-arg `ROW()` / `COLUMN()`), seeded
    /// to the formula's own address and moved by `set_current_cell` under the
    /// eval's save/restore guard.
    pub(super) current_cell: Cell<Option<CellAddress>>,
}

impl<'a, 'r> AtomFormulaProvider<'a, 'r> {
    /// Read a referenced cell through its facade as a tracked store dependency,
    /// arming the runtime cycle guard (codex F1): if `addr` is already
    /// mid-evaluation (present in the shared `in_flight` set), reading its
    /// facade would trip the store's computing-panic, so instead record the
    /// re-invalidating edge without reading (`ReadArgs::depend`) and surface a
    /// sticky `#CYCLE!`. A later edit that breaks the cycle bumps the depended
    /// atom's generation and re-derives this reader (see the `depend` primitive
    /// tests).
    fn read_facade_from(&self, ctx: &FacadeCtx, addr: CellAddress) -> Value {
        let facade = ctx.get_or_create_facade(addr);
        if ctx.is_in_flight(addr) {
            self.args.depend(facade);
            return Value::Error(ValueError::CyclicRef);
        }
        self.args.get(facade)
    }

    fn read_facade(&self, addr: CellAddress) -> Value {
        self.read_facade_from(&self.ctx, addr)
    }

    fn workbook_context(&self) -> Option<Rc<WorkbookAtomContext>> {
        self.ctx.workbook_scope().map(|(context, _)| context)
    }

    fn resolve_sheet(&self, name: &str) -> Option<(usize, FacadeCtx)> {
        self.workbook_context()?.resolve_sheet(name, self.args)
    }

    fn for_each_range_in(
        &self,
        ctx: &FacadeCtx,
        range: CellRange,
        f: &mut dyn FnMut(CellAddress, Value),
    ) {
        ctx.depend_range_geometry_epochs(range, self.args);
        let member_addrs = ctx.range_member_addrs(range);
        if range_cell_count_u64(range) <= RANGE_TIER_A_CELL_LIMIT {
            let members: HashSet<CellAddress> = member_addrs.iter().copied().collect();
            for addr in range.normalize().iter() {
                if !members.contains(&addr) {
                    let _ = self.read_facade_from(ctx, addr);
                }
            }
        }
        for addr in member_addrs {
            let value = collapse_array_for_eval(self.read_facade_from(ctx, addr));
            f(addr, value);
        }
    }

    fn formula_text_in(ctx: &FacadeCtx, addr: CellAddress) -> Option<String> {
        if let Some(text) = ctx.interior.formula_texts.borrow().get(&addr) {
            return Some(text.clone());
        }
        ctx.interior
            .formula_source
            .borrow()
            .get(&addr)
            .map(|source| source.source.as_ref().to_string())
    }
}

impl<'a, 'r> EvalProvider for AtomFormulaProvider<'a, 'r> {
    fn cell(&self, addr: CellAddress) -> Value {
        collapse_array_for_eval(self.read_facade(addr))
    }

    fn sheet_cell(&self, sheet: &str, addr: CellAddress) -> Value {
        let Some((_, ctx)) = self.resolve_sheet(sheet) else {
            return Value::Error(ValueError::InvalidRef);
        };
        collapse_array_for_eval(self.read_facade_from(&ctx, addr))
    }

    fn raw_cell(&self, addr: CellAddress) -> Value {
        self.read_facade(addr)
    }

    fn raw_sheet_cell(&self, sheet: &str, addr: CellAddress) -> Value {
        let Some((_, ctx)) = self.resolve_sheet(sheet) else {
            return Value::Error(ValueError::InvalidRef);
        };
        self.read_facade_from(&ctx, addr)
    }

    /// Store-shaped range read: Tier A per-member facades for small ranges and
    /// Tier B geometry epoch atoms for larger ranges. The evaluator callback
    /// remains sparse: empty cells are only read for dependency edges and are
    /// not emitted.
    fn for_each_range_cell(&self, range: CellRange, f: &mut dyn FnMut(CellAddress, Value)) {
        self.for_each_range_in(&self.ctx, range, f);
    }

    fn for_each_sheet_range_cell(
        &self,
        sheet: &str,
        range: CellRange,
        f: &mut dyn FnMut(CellAddress, Value),
    ) {
        let Some((_, ctx)) = self.resolve_sheet(sheet) else {
            f(
                range.normalize().start,
                Value::Error(ValueError::InvalidRef),
            );
            return;
        };
        self.for_each_range_in(&ctx, range, f);
    }

    fn current_cell(&self) -> Option<CellAddress> {
        self.current_cell.get()
    }

    fn set_current_cell(&self, addr: Option<CellAddress>) {
        self.current_cell.set(addr);
    }

    fn col_width(&self, col: u32) -> Option<u32> {
        // UNTRACKED read of the shared interior's sparse width map for
        // `CELL("width")` (D7: borrow → copy → release; no store call between,
        // no dependency edge armed). This is the formula's OWN sheet — a
        // cross-sheet `CELL("width", Other!A1)` collapses to this sheet's
        // widths, the same limitation the content-touching info_types carry.
        self.ctx.interior.col_widths.borrow().get(&col).copied()
    }

    fn cell_has_formula(&self, addr: CellAddress) -> bool {
        self.ctx.interior.formula_cells.borrow().contains_key(&addr)
            || self.ctx.interior.needs_parse.borrow().contains(&addr)
    }

    fn sheet_cell_has_formula(&self, sheet: &str, addr: CellAddress) -> bool {
        let Some((_, ctx)) = self.resolve_sheet(sheet) else {
            return false;
        };
        ctx.interior.formula_cells.borrow().contains_key(&addr)
            || ctx.interior.needs_parse.borrow().contains(&addr)
    }

    fn lookup_named(&self, name: &str) -> Option<Value> {
        self.workbook_context()?.lookup_named(name, self.args)
    }

    fn lookup_table(&self, name: Option<&str>) -> Option<ResolvedTable> {
        let context = self.workbook_context()?;
        match name {
            Some(n) => context.lookup_table_named(n, self.args),
            None => {
                // Table-less `[Col]` / `[@Col]`: locate the Table that
                // contains the currently-evaluating cell on its own sheet.
                let addr = self.current_cell()?;
                let (_, sheet_idx) = self.ctx.workbook_scope()?;
                context.lookup_table_containing(sheet_idx, addr, self.args)
            }
        }
    }

    fn current_sheet_index(&self) -> Option<usize> {
        let (context, sheet_idx) = self.ctx.workbook_scope()?;
        context.depend_topology(self.args);
        Some(sheet_idx)
    }

    fn hidden_rows(&self, sheet_index: Option<usize>) -> Option<Rc<HashSet<u32>>> {
        // Live formula-inner path: the tracked read of `manual_hidden_epoch`
        // inside `hidden_rows_for_sheet` is what makes a `set_eval_hidden_rows`
        // push precisely re-derive this SUBTOTAL 101-111 formula (design §6.2).
        self.workbook_context()?
            .hidden_rows_for_sheet(sheet_index, self.args)
    }

    fn filter_hidden_rows(&self, sheet_index: Option<usize>) -> Option<Rc<HashSet<u32>>> {
        // Twin of `hidden_rows` on the independent `filter_hidden_epoch`; read
        // by both SUBTOTAL layers (`design-filter-hidden-rows` §6.3).
        self.workbook_context()?
            .filter_hidden_rows_for_sheet(sheet_index, self.args)
    }

    fn sheet_index_of(&self, name: &str) -> Option<usize> {
        self.resolve_sheet(name).map(|(idx, _)| idx)
    }

    fn sheet_count(&self) -> usize {
        self.workbook_context()
            .map(|context| context.sheet_count(self.args))
            .unwrap_or(1)
    }

    fn cell_formula_text(&self, addr: CellAddress) -> Option<String> {
        Self::formula_text_in(&self.ctx, addr)
    }

    fn sheet_cell_formula_text(&self, sheet: &str, addr: CellAddress) -> Option<String> {
        let (_, ctx) = self.resolve_sheet(sheet)?;
        Self::formula_text_in(&ctx, addr)
    }

    fn call_custom(&self, name: &str, values: &[Value]) -> Option<Value> {
        self.workbook_context()?
            .call_custom(name, values, self.args)
    }
}
