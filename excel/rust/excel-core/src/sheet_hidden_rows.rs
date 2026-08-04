//! 被手动隐藏的行集合。
//!
//! 拆自 `sheet.rs`，是 `sheet` 的子模块 —— 照旧看得见 `Sheet` 的私有字段与私有
//! 方法。原来的私有项在这里写成 `pub(super)`，覆盖范围与它们留在 `sheet.rs`
//! 里时逐字相同。

use super::*;

/// Displace ONE row number through a row insert/delete, mirroring
/// `ShiftEdit`'s row-axis address arithmetic:
///
///   - insert at or before a row  → the row moves down by `count`
///   - delete strictly before it  → the row moves up by `count`
///   - delete covering it         → `None`; the row no longer exists
///
/// THE single definition of hidden-row displacement (82f4283 established the
/// arithmetic; E2 of `design-engine-hidden-rows.md` factored it out). Both
/// callers go through here — the index-keyed evaluation mirror below and
/// `Sheet::hidden_rows`, the engine-owned set — so the two can never drift
/// into disagreeing about where a hidden row landed. It also matches
/// `Sheet::shift_dimension_insert` / `shift_dimension_delete`, which move
/// `row_heights` on the same edit.
pub(crate) fn shift_hidden_row(row: u32, at: u32, count: u32, insert: bool) -> Option<u32> {
    if insert {
        return Some(if row >= at {
            row.saturating_add(count)
        } else {
            row
        });
    }
    if row >= at.saturating_add(count) {
        Some(row - count)
    } else if row < at {
        Some(row)
    } else {
        // Inside the deleted band — gone, not moved.
        None
    }
}

impl Sheet {
    // --- Engine-owned MANUAL hidden rows (E2, `design-engine-hidden-rows`) --
    //
    // Deliberately `pub(crate)`: `Workbook` is the only entry point, because
    // every mutation has to be followed by a `republish_hidden` that refreshes
    // the evaluation mirror. A `pub` mutator here would let a caller change
    // the owned set without the mirror noticing, which is exactly the
    // two-writers failure this slice exists to remove.

    /// The manually hidden rows, ascending. Empty when nothing is hidden.
    pub(crate) fn hidden_rows(&self) -> Vec<u32> {
        self.hidden_rows.iter().copied().collect()
    }

    /// Borrow the owned set for republishing into the evaluation mirror.
    pub(crate) fn hidden_row_set(&self) -> &BTreeSet<u32> {
        &self.hidden_rows
    }

    /// Add `rows` to the hidden set. Returns whether anything changed, so the
    /// caller can skip a republish that would only re-confirm the mirror.
    pub(crate) fn hide_rows(&mut self, rows: &[u32]) -> bool {
        let mut changed = false;
        for &row in rows {
            changed |= self.hidden_rows.insert(row);
        }
        changed
    }

    /// Remove `rows` from the hidden set. Rows that were not hidden are
    /// ignored. Returns whether anything changed.
    pub(crate) fn unhide_rows(&mut self, rows: &[u32]) -> bool {
        let mut changed = false;
        for row in rows {
            changed |= self.hidden_rows.remove(row);
        }
        changed
    }

    /// Whole-set REPLACE. Backs `Workbook::set_eval_hidden_rows` (the host
    /// port, whose contract has always been replace-not-merge) and
    /// `restore_hidden`. Returns whether anything changed.
    pub(crate) fn replace_hidden_rows(&mut self, rows: BTreeSet<u32>) -> bool {
        if self.hidden_rows == rows {
            return false;
        }
        self.hidden_rows = rows;
        true
    }

    /// Displace the owned set through a ROW insert/delete on this sheet,
    /// through the shared [`shift_hidden_row`] arithmetic. Driven from
    /// `apply_structural_shift`; column edits never call it because they
    /// displace nothing in a row set.
    pub(super) fn shift_hidden_rows(&mut self, at: u32, count: u32, insert: bool) {
        if count == 0 || self.hidden_rows.is_empty() {
            return;
        }
        self.hidden_rows = self
            .hidden_rows
            .iter()
            .filter_map(|&row| shift_hidden_row(row, at, count, insert))
            .collect();
    }
}
