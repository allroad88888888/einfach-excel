//! 批量装载路径上一条公式的安装入口。
//!
//! 拆自 `sheet.rs`，是 `sheet` 的子模块 —— 照旧看得见 `Sheet` 的私有字段与私有
//! 方法。原来的私有项在这里写成 `pub(super)`，覆盖范围与它们留在 `sheet.rs`
//! 里时逐字相同。

use super::*;

impl<'a> BulkLoader<'a> {
    /// Write a formula at `addr`. Parses, runs the same-sheet static cycle
    /// check (B.2), and installs structural metadata for lazy Store derivation.
    /// Does not evaluate the formula or notify any subscriber. Returns the same
    /// `bool` contract as `Sheet::set_formula`: `false` on parse failure or
    /// cycle (the cell is left holding `#VALUE!` / `#CYCLE!`, no notify).
    pub fn set_formula(&mut self, addr_str: &str, formula_str: &str) -> bool {
        let addr = CellAddress::parse(addr_str).expect("invalid cell address");
        self.set_formula_at(addr, formula_str)
    }

    /// Typed-address variant of [`Self::set_formula`] (A-9 follow-up):
    /// the `Workbook::bulk_load` replay and any bulk caller that already
    /// holds a `CellAddress` skip the string render + re-parse per cell.
    pub fn set_formula_at(&mut self, addr: CellAddress, formula_str: &str) -> bool {
        // AUDIT A-4 / ADR 0006 stage 1 — spill parity with
        // `Sheet::try_set_formula`: a formula always blocks a spill, so a
        // formula aimed at a projection cell withdraws the array and leaves
        // the anchor at `#SPILL!`; overwriting the anchor tears its spill
        // down. Runs BEFORE the parse check so the `write_error_no_notify`
        // parse-failure path below can never `store.set` a read-only derived
        // projection atom.
        self.prepare_spill_for_write(addr, true);
        self.sheet.clear_spill_at_address(addr);
        // Codex P2 #2 fix: validate parseability up front. If the source
        // does not parse, materialise `#VALUE!` immediately (matching
        // legacy eager behavior) and return `false` — DO NOT park
        // unparseable text into `formula_source`, otherwise
        // `get_formula(addr)` / `ISFORMULA(addr)` would surface the
        // rejected source as a live formula even though its value is
        // `#VALUE!`.
        if crate::formula::parse_formula(formula_str).is_none() {
            self.write_error_no_notify(addr, ValueError::InvalidValue);
            self.touched.insert(addr);
            return false;
        }
        // LAZY_FORMULA_INDEXING Phase 2: defer parse / dep extract /
        // dep register / FormulaRecord materialization. Store the source
        // text and mark `addr` as `needs_parse`; the actual install
        // happens lazily at first read (Phase 3) or eagerly in
        // `hydrate_all_after_load` at `flush` end while Phase 3 lands.
        self.set_formula_lazy(addr, formula_str.to_string())
    }

    /// Variant of `set_formula` that takes a pre-parsed `Expr` plus an
    /// owned source `String`. The `Workbook::bulk_load` flush uses this
    /// to avoid re-parsing the formula the workbook loader already
    /// parsed for its own cross-sheet cycle pre-check.
    ///
    /// Same return contract: `true` on success, `false` (with `#CYCLE!`
    /// written) on same-sheet cycle. `expr` is trusted to be the parse
    /// of `formula_text`; the caller keeps them in sync.
    ///
    /// LAZY_FORMULA_INDEXING Phase 2: the pre-parsed AST is discarded
    /// at this entry point. Only the source string is stored; the
    /// hydrator re-parses on first read. The pre-parse the workbook
    /// loader did is still needed for the cross-sheet cycle check it
    /// ran at queue time, but the AST does not need to survive into the
    /// sheet because the hydrator owns its own parse. Cost of the
    /// re-parse is amortised by the per-call hydration trigger; reads
    /// that never touch the cell never pay it.
    pub(crate) fn set_formula_pre_parsed(
        &mut self,
        addr: CellAddress,
        _expr: Expr,
        formula_text: String,
    ) -> bool {
        self.set_formula_lazy(addr, formula_text)
    }

    /// LAZY_FORMULA_INDEXING Phase 2 core: park `formula_text` in
    /// `Sheet::formula_source` and add `addr` to `Sheet::needs_parse`.
    /// Skips dep extract, dep register, and `FormulaRecord`
    /// materialisation. Touched is still recorded so the existing
    /// structural/subscriber maintenance in `flush()` runs.
    ///
    /// Returns `true` unconditionally — the cycle check is deferred
    /// to first read (matches the TS port's "lazy build, lazy eval"
    /// contract). The cycle-on-write semantics of `set_formula`
    /// outside the bulk-load contract are preserved by D1=4A
    /// (`Sheet::set_formula` keeps its eager parse).
    pub(super) fn set_formula_lazy(&mut self, addr: CellAddress, formula_text: String) -> bool {
        // AUDIT A-4 / ADR 0006 stage 1 — same spill handling as
        // `set_formula_at`, repeated here so the `set_formula_pre_parsed`
        // entry point (used by `Workbook::bulk_load`) is covered too. Both
        // `prepare_spill_for_write` and `clear_spill_at_address` are
        // idempotent, so the double call on the `set_formula_at` route is
        // harmless.
        self.prepare_spill_for_write(addr, true);
        let pre_range_member = self.sheet.range_member_present(addr);
        self.sheet.clear_spill_at_address(addr);

        // Detach fanout so any prior-formula / primitive-scaffold
        // teardown below does not double-fire through the listener.
        self.sheet.detach_address_sub(addr);

        // If the address previously had an eagerly-installed formula
        // record (rare for bulk_load but possible in mixed-mode
        // workloads — see `bulk_load_skips_eval_until_first_read`), tear
        // it down so the lazy path is the sole source of truth for this
        // address.
        self.sheet.remove_formula_record(addr);

        // Drop any prior primitive scaffold (no notify); mirrors the
        // primitive→formula transition cleanup in
        // `install_parsed_formula`.
        self.sheet.drop_cell_slot(addr);
        self.sheet.bump_formula_topology_epoch();

        let parsed_for_inner = parse_formula(&formula_text);

        // Park the source text. `Rc<str>` keeps the per-formula heap
        // footprint to one allocation; the hydrator clones the `Rc`
        // (cheap) when it reads back.
        self.sheet
            .interior
            .formula_source
            .borrow_mut()
            .insert(addr, ParkedFormula::new(formula_text));
        self.sheet.interior.needs_parse.borrow_mut().insert(addr);
        if parsed_for_inner.is_some() {
            self.sheet.materialize_formula_inner(addr);
        }
        self.sheet.invalidate_formula_inner(addr);
        self.sheet.bump_facade_epoch(addr);

        // Bump imported-formula counter so the scale suite's
        // `debug_imported_formula_count` reads as N after a 100k import
        // even when no formula has been hydrated. Counts every
        // successful lazy-park (matches the pre-lazy contract: the
        // counter was bumped once per `install_parsed_formula` success;
        // here we count once per `set_formula_lazy` success).
        self.sheet
            .imported_formula_count
            .set(self.sheet.imported_formula_count.get() + 1);

        self.touched.insert(addr);
        if pre_range_member != self.sheet.range_member_present(addr) {
            self.range_membership_changed.insert(addr);
        }
        true
    }
}
