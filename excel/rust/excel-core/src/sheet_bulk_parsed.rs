//! 批量装载路径上已解析公式的落盘与错误落盘。
//!
//! 拆自 `sheet.rs`，是 `sheet` 的子模块 —— 照旧看得见 `Sheet` 的私有字段与私有
//! 方法。原来的私有项在这里写成 `pub(super)`，覆盖范围与它们留在 `sheet.rs`
//! 里时逐字相同。

use super::*;

impl<'a> BulkLoader<'a> {
    /// Shared core for `set_formula` / `set_formula_pre_parsed`. Runs
    /// the same-sheet cycle check, installs static metadata, and materializes
    /// the Store-backed formula-inner.
    /// Returns `true` on success; `false` (with `#CYCLE!` written) if
    /// the formula would close a same-sheet cycle. Consumes
    /// `formula_text` to land directly in `formula_texts` without a
    /// trailing `String::clone`.
    ///
    /// LAZY_FORMULA_INDEXING Phase 3: the active bulk_load path is
    /// `set_formula_lazy`. This eager method is preserved for any
    /// future arc that needs a "force-eager" mode or for parity
    /// regression tests; `#[allow(dead_code)]` keeps the build clean
    /// while the code stays available to call.
    #[allow(dead_code)]
    pub(super) fn install_parsed_formula(
        &mut self,
        addr: CellAddress,
        expr: Expr,
        formula_text: String,
    ) -> bool {
        // Static cycle check still runs inside bulk_load — incremental cycle
        // protection isn't worth dropping for perf, and the cost is bounded by
        // the static reference closure of the new formula.
        if self.sheet.closes_local_cycle(addr, &expr) {
            self.write_error_no_notify(addr, ValueError::CyclicRef);
            self.touched.insert(addr);
            return false;
        }
        let pre_range_member = self.sheet.range_member_present(addr);

        // Detach fanout so any primitive scaffold teardown below does not fire.
        self.sheet.detach_address_sub(addr);

        let expr = Rc::new(expr);
        // Phase 1 instrumentation (bulk_import_trace): retain the public
        // dep_extract / dep_register / formula_record timing fields. P5 has
        // no separate dependency registration, so dep_register is expected
        // to stay near zero. Sample the host clock at the 4
        // sub-phase boundaries (4 calls per formula install) only on
        // the instrumented path; production is zero-cost (one thread-
        // local read + branch). Native uses an `Instant` epoch wrapped
        // in a `fn() -> f64`; wasm32 uses `js_sys::Date::now` —
        // `std::time::Instant` is not available on
        // `wasm32-unknown-unknown`. We do NOT sample around the cheap
        // intervening work (`remove_formula_record` / primitive
        // scaffold teardown); that overhead lives in `flush_ms`
        // minus the sub-phase sum and is interpretable from the
        // existing `engine_total - set_cell - set_formula` residual.
        let clock = crate::bulk_import_trace::flush_phase_clock();
        let t_dep_extract_start = clock.map(|f| f());
        let deps = Sheet::formula_deps_for(&expr);
        let static_ranges = collect_range_refs(&expr);
        // Drop any prior formula record (no notify) and any primitive scaffold
        // that no longer has dependents — mirrors `Sheet::set_formula` minus
        // the `with_remap` listener fire.
        self.sheet.remove_formula_record(addr);
        self.sheet.drop_cell_slot(addr);
        self.sheet.bump_formula_topology_epoch();
        // Move the extracted structural metadata into the `FormulaRecord`.
        let t_dep_register_start = clock.map(|f| f());
        let t_formula_record_start = clock.map(|f| f());
        let record = Rc::new(FormulaRecord::new(expr.clone(), deps, static_ranges));
        self.sheet
            .interior
            .formula_cells
            .borrow_mut()
            .insert(addr, record);
        self.sheet
            .interior
            .formula_exprs
            .borrow_mut()
            .insert(addr, expr.clone());
        // Consume the owned `formula_text` directly — the caller's
        // string allocation lands in `formula_texts` without a
        // `String::clone`.
        self.sheet
            .interior
            .formula_texts
            .borrow_mut()
            .insert(addr, formula_text);
        self.sheet.materialize_formula_inner(addr);
        self.sheet.invalidate_formula_inner(addr);
        self.sheet.bump_facade_epoch(addr);
        if let Some(now_ms) = clock {
            let t_end = now_ms();
            let t0 = t_dep_extract_start.expect("paired with clock");
            let t1 = t_dep_register_start.expect("paired with clock");
            let t2 = t_formula_record_start.expect("paired with clock");
            // The compatibility dep_extract bucket also folds the cheap
            // `remove_formula_record` + primitive scaffold cleanup into
            // its slot — those two HashMap removes are O(1) and at Mega
            // scale stay in single-digit % of total, so attributing
            // them into that bucket (rather than carving a separate
            // sub-phase) keeps the timer count to 4 per formula.
            crate::bulk_import_trace::add_flush_dep_extract_ms(t1 - t0);
            crate::bulk_import_trace::add_flush_dep_register_ms(t2 - t1);
            crate::bulk_import_trace::add_flush_formula_record_ms(t_end - t2);
        }

        // B1 — bump the imported-formula counter for successfully installed
        // bulk-load entries. Parse failure / cycle paths return earlier and
        // do not insert a formula record, so they intentionally don't bump.
        self.sheet
            .imported_formula_count
            .set(self.sheet.imported_formula_count.get() + 1);

        self.touched.insert(addr);
        if pre_range_member != self.sheet.range_member_present(addr) {
            self.range_membership_changed.insert(addr);
        }
        true
    }

    /// Inline `write_error` minus immediate Store publication and subscriber
    /// notification. Used by the parse-failure and cycle paths in bulk-mode
    /// `set_formula`.
    ///
    /// LAZY_FORMULA_INDEXING Phase 3: parse-failure / cycle now
    /// surface at first read via `hydrate_formula`'s own write_error
    /// shape. Kept for the eager `install_parsed_formula` callers that
    /// the same arc may reactivate.
    #[allow(dead_code)]
    pub(super) fn write_error_no_notify(&mut self, addr: CellAddress, err: ValueError) {
        let pre_range_member = self.sheet.range_member_present(addr);
        let had_formula = self
            .sheet
            .interior
            .formula_cells
            .borrow()
            .contains_key(&addr)
            || self.sheet.interior.needs_parse.borrow().contains(&addr);
        if had_formula {
            self.obsolete_formula_addrs.insert(addr);
        }
        self.sheet.detach_address_sub(addr);
        if had_formula {
            self.sheet.remove_formula_record(addr);
        }
        // Drop any lazy parking too.
        self.sheet
            .interior
            .formula_source
            .borrow_mut()
            .remove(&addr);
        self.sheet.interior.needs_parse.borrow_mut().remove(&addr);
        let id = self.sheet.ensure_cell(addr);
        self.sheet.store.set(id, Value::Error(err));
        self.sheet.invalidate_formula_inner(addr);
        self.sheet.bump_facade_epoch(addr);
        if pre_range_member != self.sheet.range_member_present(addr) {
            self.range_membership_changed.insert(addr);
        }
    }
}
