//! workbook filter rules operations.

use super::*;

impl Workbook {
    pub fn set_eval_filter_hidden_rows(&mut self, sheet_index: usize, rows: &[u32]) {
        if self.is_inside_custom_call() {
            return;
        }
        let Some(sheet) = self.sheets.get_mut(sheet_index) else {
            return;
        };
        sheet.replace_filter_hidden_rows(rows.iter().copied().collect());
        self.republish_hidden(sheet_index);
    }

    // === Engine-owned FILTER (E3) =======================================
    //
    // E3 of `excel/solid-excel/docs/archive/online-excel-parity/design-engine-hidden-rows.md`.
    //
    // The engine now owns the RULES and evaluates the PREDICATE itself,
    // instead of receiving a row set the host derived. Same staging as E2:
    // the host is still the writer in this slice (it keeps calling
    // `set_eval_filter_hidden_rows` above), so the product's behaviour is
    // unchanged. The engine has become the authoritative STORE for filter
    // state; it does not become the authoritative SOURCE until the host
    // switches to calling `apply_filter`.
    //
    // THE ONE INVARIANT THIS SECTION EXISTS TO PROTECT: predicate evaluation
    // is IMPERATIVE and happens at exactly three entry points. It is not a
    // derived atom, and design §2.2 gives three reasons in descending
    // severity:
    //
    //   1. A derived atom would close a REAL dependency cycle. `SUBTOTAL`
    //      reads the filter set; a derived filter set would read the
    //      predicate column's cells; put a `SUBTOTAL` in a predicate column
    //      and the graph has a loop. The compute-then-commit shape below
    //      dodges it the same way both host adapters do — the scan sees the
    //      PREVIOUS filter set, never the one it is producing.
    //   2. It would make filtering LIVE, and Excel's is not (#27: the
    //      pre-#27 implementation recomputed on every revision bump, which
    //      made our filter *more live than Excel's* — a divergence, not a
    //      feature). `Data -> Reapply` is the sanctioned refresh path.
    //   3. Cost: a whole-column rescan on every cell write.
    //
    // Structurally, not by convention: nothing outside these three entry
    // points can write the derived set, and none of them registers a
    // dependency edge, because the scan reads through the eager
    // `for_each_sparse_range_cell` path rather than a tracked one.

    /// Apply `rules` to `sheet_index`: run the predicate ONCE, commit both
    /// the rules and the rows they hid, and republish the evaluation mirror.
    ///
    /// An empty `rules` slice is the same statement as `clear_filter`.
    ///
    /// Rejections mutate NOTHING (see [`FilterError`]) — in particular an
    /// over-budget source leaves the previous visibility standing rather
    /// than truncating the scan and showing a confidently wrong answer,
    /// which is the host adapter's existing `FILTER_SORT_SOURCE_TOO_LARGE`
    /// behaviour.
    pub fn apply_filter(
        &mut self,
        sheet_index: usize,
        rules: &[ColumnFilterRule],
    ) -> Result<FilterApplyReport, FilterError> {
        self.run_filter(sheet_index, rules.to_vec())
    }

    /// `Data -> Reapply` (Excel `Ctrl+Alt+L`): re-run the ALREADY COMMITTED
    /// rules against current cell values.
    ///
    /// This carries no rules of its own, and that is the point — reapply can
    /// never change WHAT is filtered, only WHICH rows currently satisfy it.
    /// It is also the only supported way to refresh visibility after an
    /// edit, which is what makes the snapshot semantics livable.
    ///
    /// A sheet with no committed filter reapplies to nothing.
    pub fn reapply_filter(&mut self, sheet_index: usize) -> Result<FilterApplyReport, FilterError> {
        let rules = self
            .sheets
            .get(sheet_index)
            .ok_or(FilterError::InvalidSheet)?
            .filter()
            .map(|filter| filter.rules().to_vec())
            .unwrap_or_default();
        self.run_filter(sheet_index, rules)
    }

    /// Drop `sheet_index`'s filter: rules and derived rows both. Cheap and
    /// scan-free — there is nothing to evaluate.
    pub fn clear_filter(&mut self, sheet_index: usize) -> Result<FilterApplyReport, FilterError> {
        if self.is_inside_custom_call() {
            return Err(FilterError::MutationDuringCustomCall);
        }
        let sheet = self
            .sheets
            .get_mut(sheet_index)
            .ok_or(FilterError::InvalidSheet)?;
        if sheet.clear_filter() {
            self.republish_hidden(sheet_index);
        }
        Ok(FilterApplyReport::default())
    }

    /// The committed filter rules on `sheet_index`, or empty.
    pub fn filter_rules(&self, sheet_index: usize) -> Vec<ColumnFilterRule> {
        self.sheets
            .get(sheet_index)
            .and_then(Sheet::filter)
            .map(|filter| filter.rules().to_vec())
            .unwrap_or_default()
    }

    /// The rows `sheet_index`'s filter currently hides, ascending.
    pub fn filter_hidden_rows(&self, sheet_index: usize) -> Vec<u32> {
        self.sheets
            .get(sheet_index)
            .map(Sheet::filter_hidden_rows)
            .unwrap_or_default()
    }
}
