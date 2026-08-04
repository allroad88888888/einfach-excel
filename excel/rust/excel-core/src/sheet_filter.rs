//! 自动筛选的状态与它筛掉的那些行。
//!
//! 拆自 `sheet.rs`，是 `sheet` 的子模块 —— 照旧看得见 `Sheet` 的私有字段与私有
//! 方法。原来的私有项在这里写成 `pub(super)`，覆盖范围与它们留在 `sheet.rs`
//! 里时逐字相同。

use super::*;

impl Sheet {
    // --- Engine-owned FILTER state (E3, `design-engine-hidden-rows`) ------
    //
    // Same `pub(crate)` reasoning as the manual half above: `Workbook` is
    // the only entry point, because every mutation has to be followed by a
    // `republish_hidden` that refreshes the evaluation mirror.

    /// The committed AutoFilter, if one is active.
    pub(crate) fn filter(&self) -> Option<&crate::filter::SheetAutoFilter> {
        self.filter.as_ref()
    }

    /// The rows the committed filter hid, ascending. Empty when no filter
    /// is active — a lookup miss and an empty set are the same "nothing is
    /// filtered out" signal, exactly as in the evaluation mirror.
    pub(crate) fn filter_hidden_rows(&self) -> Vec<u32> {
        self.filter
            .as_ref()
            .map(crate::filter::SheetAutoFilter::hidden_rows)
            .unwrap_or_default()
    }

    /// Borrow the derived set for republishing into the evaluation mirror.
    pub(crate) fn filter_hidden_set(&self) -> Option<&BTreeSet<u32>> {
        self.filter.as_ref().map(|f| f.hidden_set())
    }

    /// Commit a completed predicate run. `rules` empty drops the filter
    /// entirely rather than storing a vacuous one, so "no rules" has one
    /// representation instead of two. Returns whether anything changed.
    pub(crate) fn commit_filter(
        &mut self,
        rules: Vec<crate::filter::ColumnFilterRule>,
        hidden: BTreeSet<u32>,
    ) -> bool {
        let next = if rules.is_empty() && hidden.is_empty() {
            None
        } else {
            Some(crate::filter::SheetAutoFilter::new(rules, hidden))
        };
        if self.filter == next {
            return false;
        }
        self.filter = next;
        true
    }

    /// Replace ONLY the derived set, leaving the rules alone.
    ///
    /// Backs `Workbook::set_eval_filter_hidden_rows`, the host port whose
    /// contract has always been "here is the answer, I computed it myself"
    /// — it carries a row set and no rules. While the host is still the
    /// writer (through E4), that is the shape the engine has to accept, and
    /// the rows it pushes are the same rows `apply_filter` would derive.
    pub(crate) fn replace_filter_hidden_rows(&mut self, rows: BTreeSet<u32>) -> bool {
        match self.filter.as_mut() {
            Some(filter) => {
                if *filter.hidden_set() == rows {
                    return false;
                }
                if rows.is_empty() && filter.rules().is_empty() {
                    self.filter = None;
                    return true;
                }
                filter.set_hidden(rows);
                true
            }
            None => {
                if rows.is_empty() {
                    return false;
                }
                self.filter = Some(crate::filter::SheetAutoFilter::new(Vec::new(), rows));
                true
            }
        }
    }

    /// Drop the filter entirely. Returns whether anything changed.
    pub(crate) fn clear_filter(&mut self) -> bool {
        self.filter.take().is_some()
    }

    /// Displace the DERIVED set through a ROW insert/delete, through the
    /// same shared [`shift_hidden_row`] arithmetic the manual set uses.
    ///
    /// Displacement, never re-derivation: this is what keeps snapshot
    /// semantics true across structural edits. A row that was hidden stays
    /// hidden at its new index; a row inside a deleted band stops existing.
    /// The RULES are untouched — the answer moves, it is not recomputed.
    pub(super) fn shift_filter_hidden_rows(&mut self, at: u32, count: u32, insert: bool) {
        let Some(filter) = self.filter.as_mut() else {
            return;
        };
        if count == 0 || filter.hidden_set().is_empty() {
            return;
        }
        let next: BTreeSet<u32> = filter
            .hidden_set()
            .iter()
            .filter_map(|&row| shift_hidden_row(row, at, count, insert))
            .collect();
        *filter.hidden_set_mut() = next;
    }

    /// Cumulative predicate-scan count — see the field doc for why this is
    /// the observable that matters.
    #[doc(hidden)]
    pub(crate) fn debug_filter_scan_count(&self) -> u64 {
        self.filter_scan_count.get()
    }

    pub(crate) fn note_filter_scan(&self) {
        self.filter_scan_count
            .set(self.filter_scan_count.get().saturating_add(1));
    }
}
