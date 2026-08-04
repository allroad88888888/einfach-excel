//! 一次插删行列编辑的编排。
//!
//! 拆自 `sheet.rs`，是 `sheet` 的子模块 —— 照旧看得见 `Sheet` 的私有字段与私有
//! 方法。原来的私有项在这里写成 `pub(super)`，覆盖范围与它们留在 `sheet.rs`
//! 里时逐字相同。

use super::*;

impl Sheet {
    // === Phase 4: structural edits ===

    /// Insert `count` empty rows starting at `at` (0-based). All cells at or
    /// below `at` shift down by `count`; existing formulas are retargeted so
    /// `=A5` stays pointing at the same logical row even after a row insert
    /// pushes it to A6.
    pub fn insert_row(&mut self, at: u32, count: u32) {
        if count == 0 {
            return;
        }
        self.apply_structural_shift(crate::shift::ShiftEdit::RowInsert { at, count });
    }

    /// Delete `count` rows starting at `at`. References inside the deleted
    /// range become `#REF!`; references below shift up.
    pub fn delete_row(&mut self, at: u32, count: u32) {
        if count == 0 {
            return;
        }
        self.apply_structural_shift(crate::shift::ShiftEdit::RowDelete { at, count });
    }

    pub fn insert_col(&mut self, at: u32, count: u32) {
        if count == 0 {
            return;
        }
        self.apply_structural_shift(crate::shift::ShiftEdit::ColInsert { at, count });
    }

    pub fn delete_col(&mut self, at: u32, count: u32) {
        if count == 0 {
            return;
        }
        self.apply_structural_shift(crate::shift::ShiftEdit::ColDelete { at, count });
    }

    /// Shared body of the four structural ops.
    ///
    /// AUDIT A-1: structural edits no longer hydrate the sheet. The old
    /// shape (`hydrate_all_lazy_formulas` first, so the AST retarget
    /// covers parked formulas — the 7d0e380 self-cycle fix) made one
    /// `insert_row` O(total formulas × parse) and left a lazy sheet
    /// permanently eager. Now:
    ///
    ///   - HYDRATED formulas: `retarget_formula_refs` maps the AST and
    ///     installs the mapped result DIRECTLY (no render→re-parse) —
    ///     and skips reinstall entirely when the shift didn't touch the
    ///     formula's refs.
    ///   - LAZY (parked) formulas: `retarget_parked_sources` rewrites
    ///     reference tokens in the parked SOURCE TEXT
    ///     (`shift::rewrite_parked_source`, pure string work — no
    ///     parse, no dep install), preserving the 7d0e380 invariant
    ///     that the text always references post-shift addresses before
    ///     hydration can run (`A1="=A2"` + insert_row(0,1) ⇒ text
    ///     `=A3` at the relocated A2 — no self-cycle).
    ///
    /// W1.1 (A-5) is preserved: spills are torn down before the shift
    /// and surviving anchors re-derived after both retargets.
    pub(super) fn apply_structural_shift(&mut self, edit: crate::shift::ShiftEdit) {
        self.with_structural_edit(|sheet| {
            // AUDIT A-5: tear every spill down BEFORE the shift,
            // re-derive surviving anchors after the retarget. Anchors
            // inside a deleted band map to the REF_INVALID sentinel and
            // are skipped by `rederive_spill_anchors`.
            let spill_anchors = sheet.teardown_all_spills();
            // ADR 0006 stage 0: collided anchors installed no targets, so
            // they are absent from `spill_targets` and invisible to the
            // teardown above — yet the shift is exactly the event that can
            // move the obstruction out of (or into) their bounding box.
            let blocked_anchors = sheet.teardown_blocked_spill_anchors();
            match edit {
                crate::shift::ShiftEdit::RowDelete { at, count } => {
                    sheet.drop_cells_in(|addr| addr.row >= at && addr.row < at + count);
                }
                crate::shift::ShiftEdit::ColDelete { at, count } => {
                    sheet.drop_cells_in(|addr| addr.col >= at && addr.col < at + count);
                }
                _ => {}
            }
            sheet.relocate_cells(|addr| edit.apply(addr));
            sheet.retarget_formula_refs(edit);
            sheet.retarget_parked_sources(edit);
            match edit {
                crate::shift::ShiftEdit::RowInsert { at, count } => {
                    Self::shift_dimension_insert(&mut sheet.row_heights, at, count);
                    // The engine-owned hidden set is row-indexed dimension
                    // metadata too, so it rides the SAME pass — through the
                    // single `shift_hidden_row` arithmetic the evaluation
                    // mirror uses, which is why the two cannot drift.
                    sheet.shift_hidden_rows(at, count, true);
                    // The FILTER-derived set rides the same pass (E3). It
                    // is DISPLACED, never re-derived: re-running the
                    // predicate here is precisely the "more live than
                    // Excel" behaviour #27 removed.
                    sheet.shift_filter_hidden_rows(at, count, true);
                }
                crate::shift::ShiftEdit::RowDelete { at, count } => {
                    Self::shift_dimension_delete(&mut sheet.row_heights, at, count);
                    sheet.shift_hidden_rows(at, count, false);
                    sheet.shift_filter_hidden_rows(at, count, false);
                }
                crate::shift::ShiftEdit::ColInsert { at, count } => {
                    Self::shift_dimension_insert(
                        &mut sheet.interior.col_widths.borrow_mut(),
                        at,
                        count,
                    );
                }
                crate::shift::ShiftEdit::ColDelete { at, count } => {
                    Self::shift_dimension_delete(
                        &mut sheet.interior.col_widths.borrow_mut(),
                        at,
                        count,
                    );
                }
            }
            // Previously-installed anchors re-derive BEFORE previously-blocked
            // ones: an anchor that owned its rectangle before the shift keeps
            // first claim on it afterwards, instead of losing a race to a
            // blocked neighbour that the shift happened to unblock.
            sheet.rederive_spill_anchors(
                spill_anchors
                    .into_iter()
                    .chain(blocked_anchors)
                    .map(|a| edit.apply(a))
                    .collect(),
            );
            sheet.prune_obsolete_formula_atoms();
        });
    }

    /// Run a structural edit (row/col insert/delete) so that subscribers are
    /// notified at most once per address, only when the displayed value at
    /// that address actually changed. Detaches every fanout for the duration
    /// of the edit so internal `store.set` calls don't fan out partial
    /// intermediate states; reattaches at the end.
    pub(crate) fn with_structural_edit(&mut self, f: impl FnOnce(&mut Self)) {
        let addrs: Vec<CellAddress> = self.cell_subscriptions.keys().copied().collect();
        let mut pre: Vec<(CellAddress, Value)> = Vec::with_capacity(addrs.len());
        for addr in &addrs {
            pre.push((*addr, self.peek_value(*addr)));
            self.detach_address_sub(*addr);
        }

        // A structural shift rewrites many cell, epoch, and formula atoms.
        // Keep those writes in one Store transaction so dependents observe
        // only the final topology and propagation walks the atomm graph once.
        self.bump_formula_topology_epoch();
        let store = self.store.clone();
        store.batch(|_| f(self));

        for addr in &addrs {
            self.attach_address_sub(*addr);
        }
        for (addr, pre_val) in pre {
            let post_val = self.peek_value(addr);
            if pre_val != post_val {
                self.notify_address_subscribers(addr);
            }
        }
    }
}
