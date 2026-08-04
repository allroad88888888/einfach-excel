//! 结构编辑之后公式里的引用指向哪里。
//!
//! 拆自 `sheet.rs`，是 `sheet` 的子模块 —— 照旧看得见 `Sheet` 的私有字段与私有
//! 方法。原来的私有项在这里写成 `pub(super)`，覆盖范围与它们留在 `sheet.rs`
//! 里时逐字相同。

use super::*;

impl Sheet {
    /// Apply a structural edit to every HYDRATED formula AST. Used after
    /// structural edits so formulas continue to point at the same
    /// logical cell.
    ///
    /// The mapped AST is installed directly, without a render/re-parse round
    /// trip. Formulas whose AST is unchanged retain their structural record
    /// and settled Store-derived value when that is provably safe:
    ///
    ///   - mapped AST == old AST means every STATIC ref points at a
    ///     cell strictly below the edit boundary, i.e. a cell that did
    ///     not move — the derived value remains fresh…
    ///   - …unless a static range can see the shifted region
    ///     (`ShiftEdit::touches_range`: unbounded `A:A` under a row
    ///     edit, etc.) or expanded static point metadata moved/died. In that
    ///     case formula-inner and facade are invalidated.
    ///
    /// Reactive edges are never rebuilt here. They are owned by Store and are
    /// re-recorded when an invalidated formula-inner next derives its value.
    pub(super) fn retarget_formula_refs(&mut self, edit: crate::shift::ShiftEdit) {
        let f = |addr: CellAddress| edit.apply(addr);
        let snapshot: Vec<(CellAddress, Rc<Expr>)> = self
            .interior
            .formula_exprs
            .borrow()
            .iter()
            .map(|(addr, expr)| (*addr, expr.clone()))
            .collect();
        for (addr, old_expr) in snapshot {
            let new_expr = crate::shift::map_addrs(&old_expr, &f);
            if crate::shift::contains_invalid_ref(&new_expr) {
                // Formula references a cell deleted by this structural edit.
                // Excel produces #REF!.
                self.write_error(addr, ValueError::InvalidRef);
                continue;
            }
            if new_expr == *old_expr {
                // Shift didn't touch any static ref. Keep the record, but
                // invalidate the Store-derived value when the edit can still
                // change observed values (see doc comment).
                let record = self.interior.formula_cells.borrow().get(&addr).cloned();
                if let Some(record) = record {
                    let static_ref_moved = record.deps.borrow().iter().any(|d| f(*d) != *d);
                    let range_touched = record
                        .static_ranges
                        .borrow()
                        .iter()
                        .any(|r| edit.touches_range(r));
                    if static_ref_moved {
                        // Keep static structural metadata aligned. Deleted
                        // addresses map to the sentinel and are dropped.
                        let remapped: HashSet<CellAddress> = record
                            .deps
                            .borrow()
                            .iter()
                            .map(|d| f(*d))
                            .filter(|d| {
                                d.row != crate::shift::REF_INVALID_ROW
                                    && d.col != crate::shift::REF_INVALID_COL
                            })
                            .collect();
                        *record.deps.borrow_mut() = remapped;
                    }
                    if static_ref_moved || range_touched {
                        // The value may change even though the AST did not.
                        // Store publication from the formula facade wakes its
                        // recorded dependents; the next read refreshes edges.
                        self.invalidate_formula_value(addr);
                    }
                }
                continue;
            }
            // Refs crossed the boundary: install the mapped AST directly and
            // invalidate formula-inner. Render (no re-parse!) only to keep
            // `formula_texts` / `get_formula` truthful.
            let new_expr_rc = Rc::new(new_expr);
            let deps = Sheet::formula_deps_for(&new_expr_rc);
            let static_ranges = collect_range_refs(&new_expr_rc);
            let record = Rc::new(FormulaRecord::new(new_expr_rc.clone(), deps, static_ranges));
            self.interior
                .formula_cells
                .borrow_mut()
                .insert(addr, record);
            self.interior
                .formula_exprs
                .borrow_mut()
                .insert(addr, new_expr_rc.clone());
            self.interior
                .formula_texts
                .borrow_mut()
                .insert(addr, crate::shift::render_formula(&new_expr_rc));
            self.materialize_formula_inner(addr);
            self.invalidate_formula_value(addr);
        }
    }

    /// AUDIT A-1 (lazy half): retarget every PARKED formula by rewriting
    /// reference tokens in its source text — no parse, no hydration, no
    /// dependency work. Runs after `retarget_formula_refs`; `write_error` for
    /// dead refs invalidates the corresponding Store facade normally.
    ///
    /// Cross-sheet scope mirrors the hydrated path exactly: sheet-
    /// qualified refs in this sheet's sources are not shifted, and
    /// other sheets' parked formulas referencing this sheet are not
    /// rewritten (`map_addrs` has never retargeted either).
    pub(super) fn retarget_parked_sources(&mut self, edit: crate::shift::ShiftEdit) {
        let mut rewrites: Vec<(CellAddress, String)> = Vec::new();
        let mut dead: Vec<CellAddress> = Vec::new();
        {
            let source = self.interior.formula_source.borrow();
            for (addr, src) in source.iter() {
                match crate::shift::rewrite_parked_source(src.source.as_ref(), edit) {
                    crate::shift::SourceRewrite::Unchanged => {}
                    crate::shift::SourceRewrite::Rewritten(s) => rewrites.push((addr, s)),
                    crate::shift::SourceRewrite::DeadRef => dead.push(addr),
                }
            }
        }
        {
            let mut source = self.interior.formula_source.borrow_mut();
            for (addr, s) in rewrites {
                source.insert(addr, ParkedFormula::new(s));
            }
        }
        for addr in dead {
            // Parity guard for unparseable parked sources (possible via
            // `bulk_install_storage`): the hydrated path would surface
            // `#VALUE!` at first read and never see a ref to kill — so
            // a "dead ref" inside garbage stays parked untouched.
            let parses = {
                let source = self.interior.formula_source.borrow();
                source
                    .get(&addr)
                    .map(|src| crate::formula::parse_formula(src.source.as_ref()).is_some())
                    .unwrap_or(false)
            };
            if !parses {
                continue;
            }
            // Mirror the hydrated retarget: the whole formula becomes a
            // #REF! error cell. `write_error` drains the parked state
            // (`remove_formula_record` clears `formula_source` /
            // `needs_parse` first) and invalidates Store dependents through
            // the cell facade.
            self.write_error(addr, ValueError::InvalidRef);
        }
    }

    /// Collect the `(address, rewritten formula text)` pairs for every
    /// formula on this sheet whose structured (Table) references change under
    /// `spec` (design doc #32 §4.3 table/column rename). Read-only: the
    /// caller re-installs each rewrite through the normal `set_formula` path,
    /// so parking, dependency install, cycle checks, and subscriber
    /// notification are unchanged — the same "two-channel" reach as
    /// `retarget_formula_refs` + `retarget_parked_sources`, but keyed on the
    /// Table registry rather than on shifted A1 coordinates.
    ///
    /// Hydrated ASTs (`formula_exprs`) are rewritten in place; parked
    /// sources (`formula_source`) are parsed, rewritten, and rendered —
    /// rename is a low-frequency dialog op, and a cheap `[` pre-filter skips
    /// the lazy formulas that provably hold no structured reference.
    ///
    /// `bare_for(addr)` decides whether a table-less `[Col]` at `addr`
    /// targets the renamed Table (column rename on the Table's anchor
    /// sheet); it is always `false` for a table rename.
    pub(crate) fn collect_table_ref_rewrites(
        &self,
        spec: &crate::shift::TableRefEditSpec,
        bare_for: &dyn Fn(CellAddress) -> bool,
    ) -> Vec<(CellAddress, String)> {
        let mut out: Vec<(CellAddress, String)> = Vec::new();
        {
            let exprs = self.interior.formula_exprs.borrow();
            for (addr, expr) in exprs.iter() {
                if let Some(new_expr) =
                    crate::shift::rewrite_table_refs(expr, spec, bare_for(*addr))
                {
                    out.push((*addr, crate::shift::render_formula(&new_expr)));
                }
            }
        }
        let hydrated: HashSet<CellAddress> = out.iter().map(|(a, _)| *a).collect();
        let sources = self.interior.formula_source.borrow();
        for (addr, src) in sources.iter() {
            if hydrated.contains(&addr) {
                continue;
            }
            let text = src.source.as_ref();
            if !text.contains('[') {
                continue;
            }
            let Some(expr) = crate::formula::parse_formula(text) else {
                continue;
            };
            if let Some(new_expr) = crate::shift::rewrite_table_refs(&expr, spec, bare_for(addr)) {
                out.push((addr, crate::shift::render_formula(&new_expr)));
            }
        }
        out
    }
}
