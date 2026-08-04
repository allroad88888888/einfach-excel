//! 一条惰性公式在首次被读时的水合。
//!
//! 拆自 `sheet.rs`，是 `sheet` 的子模块 —— 照旧看得见 `Sheet` 的私有字段与私有
//! 方法。原来的私有项在这里写成 `pub(super)`，覆盖范围与它们留在 `sheet.rs`
//! 里时逐字相同。

use super::*;

impl Sheet {
    /// LAZY_FORMULA_INDEXING Phase 3: idempotent lazy parse+install.
    ///
    /// If `addr` is not in `needs_parse`, returns immediately (already
    /// hydrated or never lazy). Otherwise pulls the source text out of
    /// `formula_source`, parses it, runs the same-sheet static cycle
    /// check (B.2), then installs static metadata and materializes the
    /// Store-backed formula-inner via the same shape as
    /// `BulkLoader::install_parsed_formula`.
    ///
    /// Takes `&self` (not `&mut self`) so read-path callers can hydrate
    /// without holding a unique borrow of the sheet. All mutable state
    /// goes through the per-field `RefCell`s (`formula_cells`,
    /// `formula_exprs`, `formula_texts`, `needs_parse`)
    /// or interior-mutable fields
    /// (`imported_formula_count` is bumped at park time, not here).
    ///
    /// Cost-amortisation note: this method is called once per cell per
    /// lifetime — the `needs_parse.contains(&addr)` check is a cheap
    /// `HashSet` lookup that hits ~all reads in the steady state. For
    /// the typical workload (rendering a 50×27 viewport over a
    /// million-formula sheet) only ~1350 cells go through the parse
    /// branch.
    pub(super) fn hydrate_formula(&self, addr: CellAddress) {
        // Fast path: not lazy. One hashset lookup, no allocations.
        // Done under a short borrow so concurrent `&self` callers don't
        // race against a `borrow_mut` from the parse path below.
        if !self.interior.needs_parse.borrow().contains(&addr) {
            return;
        }

        // Drain the source. Removing from `formula_source` AND
        // `needs_parse` in lockstep keeps the
        // `formula_source ↔ needs_parse` invariant tight. Done under
        // exclusive borrows that are released before the parse so the
        // parse path can re-enter sheet-level `RefCell`s freely.
        let parked = {
            let mut needs = self.interior.needs_parse.borrow_mut();
            if !needs.remove(&addr) {
                return;
            }
            let src = self.interior.formula_source.borrow_mut().remove(&addr);
            match src {
                Some(s) => s,
                None => return,
            }
        };

        // Parse the source. On failure write `#VALUE!` via the
        // `&self`-friendly path. There is no parsed reference metadata;
        // synthesize a minimal literal-error record and formula-inner so
        // same-sheet reads still flow through Store.
        let source = parked.source;
        let checked_at = parked.cycle_checked_at.get();
        let expr_owned = match parse_formula(source.as_ref()) {
            Some(e) => e,
            None => {
                let err_expr = Rc::new(Expr::Error(ValueError::InvalidValue));
                let record = Rc::new(FormulaRecord::new(
                    err_expr.clone(),
                    HashSet::new(),
                    HashSet::new(),
                ));
                record
                    .cycle_checked_at
                    .set(self.formula_topology_epoch.get());
                self.interior
                    .formula_cells
                    .borrow_mut()
                    .insert(addr, record);
                self.interior
                    .formula_exprs
                    .borrow_mut()
                    .insert(addr, err_expr);
                self.interior
                    .formula_texts
                    .borrow_mut()
                    .insert(addr, source.as_ref().to_string());
                self.materialize_formula_inner(addr);
                self.invalidate_formula_value(addr);
                return;
            }
        };

        let expr_rc = Rc::new(expr_owned);

        // Cycle check (B.2). Parked formulas may reuse certificates created
        // by an earlier hydration in the same immutable formula topology.
        let cycle_check = self.closes_parked_local_cycle(addr, expr_rc.clone(), checked_at);
        if cycle_check.closes_cycle {
            let err_expr = Rc::new(Expr::Error(ValueError::CyclicRef));
            let record = Rc::new(FormulaRecord::new(
                err_expr.clone(),
                HashSet::new(),
                HashSet::new(),
            ));
            record
                .cycle_checked_at
                .set(self.formula_topology_epoch.get());
            self.interior
                .formula_cells
                .borrow_mut()
                .insert(addr, record);
            self.interior
                .formula_exprs
                .borrow_mut()
                .insert(addr, err_expr);
            self.interior
                .formula_texts
                .borrow_mut()
                .insert(addr, source.as_ref().to_string());
            self.materialize_formula_inner(addr);
            self.invalidate_formula_value(addr);
            return;
        }

        // Install static references and the FormulaRecord, then materialize
        // the formula-inner. This mirrors `BulkLoader::install_parsed_formula`
        // through `&self`-only paths.
        let deps = Sheet::formula_deps_for(&expr_rc);
        let static_ranges = collect_range_refs(&expr_rc);
        let record = Rc::new(FormulaRecord::new(expr_rc.clone(), deps, static_ranges));
        if cycle_check.target_certified {
            record
                .cycle_checked_at
                .set(self.formula_topology_epoch.get());
        }
        self.interior
            .formula_cells
            .borrow_mut()
            .insert(addr, record);
        self.interior
            .formula_exprs
            .borrow_mut()
            .insert(addr, expr_rc.clone());
        self.interior
            .formula_texts
            .borrow_mut()
            .insert(addr, source.as_ref().to_string());
        self.materialize_formula_inner(addr);
    }

    pub(super) fn remove_formula_record(&mut self, addr: CellAddress) -> Option<Rc<FormulaRecord>> {
        // LAZY_FORMULA_INDEXING Phase 3: drain lazy state FIRST so an
        // "unhydrated only" addr still gets cleaned up even when there
        // is no eager `FormulaRecord` to remove. This matters when
        // `try_set_formula` calls `remove_formula_record` against a
        // bulk-loaded but not-yet-read formula — without the early
        // drain the new install would race the old lazy entry on the
        // first read.
        let parked = self.interior.formula_source.borrow_mut().remove(&addr);
        self.interior.needs_parse.borrow_mut().remove(&addr);
        let record = self.interior.formula_cells.borrow_mut().remove(&addr);
        if record.is_some() {
            self.interior.formula_exprs.borrow_mut().remove(&addr);
            self.interior.formula_texts.borrow_mut().remove(&addr);
            self.invalidate_formula_inner(addr);
        }
        if parked.is_some() || record.is_some() {
            self.bump_formula_topology_epoch();
        }
        record
    }
}
