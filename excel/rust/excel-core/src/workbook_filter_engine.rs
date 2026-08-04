//! workbook filter engine operations.

use super::*;

impl Workbook {
    pub(crate) fn run_filter(
        &mut self,
        sheet_index: usize,
        rules: Vec<ColumnFilterRule>,
    ) -> Result<FilterApplyReport, FilterError> {
        if self.is_inside_custom_call() {
            return Err(FilterError::MutationDuringCustomCall);
        }
        if sheet_index >= self.sheets.len() {
            return Err(FilterError::InvalidSheet);
        }

        // Phase 1 — scan, behind `&self`, into locals. Nothing is committed
        // yet, so a rejection below leaves the workbook untouched.
        let (hidden, scanned_rows, predicate_cells) = self.scan_filter(sheet_index, &rules)?;

        // Phase 2 — commit, then republish the mirror from the owning side.
        let report = FilterApplyReport {
            hidden_rows: hidden.iter().copied().collect(),
            scanned_rows,
            predicate_cells,
        };
        if self.sheets[sheet_index].commit_filter(rules, hidden) {
            self.republish_hidden(sheet_index);
        }
        Ok(report)
    }

    /// ONE predicate scan. `&self` throughout, and deliberately so: every
    /// cell read goes through `for_each_sparse_range_cell`, the same eager
    /// path `readSparseRange` uses at the wasm boundary, which registers no
    /// Store dependency edge. A tracked read here would wire the predicate
    /// columns into the reactive graph and bring liveness back through the
    /// back door — see the section header.
    ///
    /// Extent, columns and budget are the host adapter's arithmetic,
    /// transcribed so the answer cannot move:
    ///
    ///   - extent = `max_non_empty_row + 1` over the WHOLE sheet, from the
    ///     same `for_each_non_empty` walk `listNonEmpty` exposes — not the
    ///     predicate columns' own extent;
    ///   - columns = column 0 (summary-row probe) plus each rule's column;
    ///   - budget = `rows * columns` against [`MAX_FILTER_PREDICATE_CELLS`].
    fn scan_filter(
        &self,
        sheet_index: usize,
        rules: &[ColumnFilterRule],
    ) -> Result<(BTreeSet<u32>, u32, u32), FilterError> {
        let sheet = self
            .sheets
            .get(sheet_index)
            .ok_or(FilterError::InvalidSheet)?;

        // No rules means NO SCAN AT ALL — checked before the extent probe
        // and before the budget, which is not merely an optimisation. The
        // host short-circuits in exactly this order (`if
        // (!filterSortHasEffect(next)) { … return }` sits above the
        // `listNonEmpty` extent probe in `setFilterSort`), so budgeting an
        // empty rule set here would make CLEARING a filter fail on any
        // sheet too large to scan — a workbook could get permanently stuck
        // filtered. Applying no rules is a pure state change.
        if rules.is_empty() {
            return Ok((BTreeSet::new(), 0, 0));
        }

        let cols = crate::filter::predicate_columns(rules);

        let mut max_row: Option<u32> = None;
        sheet.for_each_non_empty(|addr| {
            max_row = Some(match max_row {
                Some(current) if current >= addr.row => current,
                _ => addr.row,
            });
        });
        let scanned_rows = max_row.map(|row| row + 1).unwrap_or(0);

        let predicate_cells = scanned_rows.saturating_mul(cols.len() as u32);
        if predicate_cells > crate::filter::MAX_FILTER_PREDICATE_CELLS {
            return Err(FilterError::SourceTooLarge {
                rows: scanned_rows,
                columns: cols.len() as u32,
                predicate_cells,
            });
        }
        if scanned_rows == 0 {
            return Ok((BTreeSet::new(), scanned_rows, predicate_cells));
        }

        sheet.note_filter_scan();
        let last_row = scanned_rows - 1;
        let mut values: HashMap<(u32, u32), String> = HashMap::new();
        for &col in &cols {
            let range = CellRange::new(CellAddress::new(0, col), CellAddress::new(last_row, col));
            self.for_each_sparse_range_cell(sheet_index, range, |addr, value| {
                values.insert((addr.row, addr.col), crate::value_to_display(&value));
            });
        }
        // A read boundary, exactly like `get_cell`'s: settle the derived
        // states the scan parked so an unrelated later write does not
        // inherit bookkeeping proportional to the whole scan.
        self.store.settle_pending_reads();

        // Absent cell == empty string, matching `values.get(...) ?? ''` on
        // the host side. Sparse iteration only visits non-empty cells, so
        // this is where blank rows acquire the `""` that `Number("")` then
        // turns into 0 for a `range` rule.
        let hidden = crate::filter::hidden_rows_for_scan(rules, scanned_rows, |row, col| {
            values.get(&(row, col)).cloned().unwrap_or_default()
        });
        Ok((hidden, scanned_rows, predicate_cells))
    }

    /// Cumulative predicate scans on `sheet_index` — the observable that
    /// proves visibility is a snapshot: cell writes, structural edits and
    /// epoch bumps must all leave it alone.
    #[doc(hidden)]
    pub fn debug_filter_scan_count(&self, sheet_index: usize) -> u64 {
        self.sheets
            .get(sheet_index)
            .map(Sheet::debug_filter_scan_count)
            .unwrap_or(0)
    }

    /// Capture every sheet's filter state (rules AND the rows they hid) as
    /// an undo / persistence before-image. Twin of [`Self::snapshot_hidden`]
    /// down to the sheet-INDEX keying; sheets with no filter are omitted.
    ///
    /// Both halves are captured because they are not redundant: restoring
    /// rules alone would force a re-derivation against whatever the cells
    /// say NOW, which is precisely the liveness snapshot semantics forbids.
    /// An undo has to restore the rows that WERE hidden.
    pub fn snapshot_filters(&self) -> FilterSnapshot {
        FilterSnapshot::from_sheets(
            self.sheets
                .iter()
                .enumerate()
                .filter_map(|(sheet_index, sheet)| {
                    sheet.filter().map(|filter| SheetFilterState {
                        sheet_index,
                        rules: filter.rules().to_vec(),
                        hidden_rows: filter.hidden_rows(),
                    })
                })
                .collect(),
        )
    }

    /// Replace every sheet's filter state with `snapshot`, returning how
    /// many sheets ended up with a filter.
    ///
    /// Whole-workbook REPLACE, exactly like [`Self::restore_hidden`]: a
    /// sheet the snapshot does not mention has its filter CLEARED, not left
    /// alone, which is what makes undoing "filter a previously-unfiltered
    /// sheet" symmetric. Entries past the end of the sheet vector are
    /// dropped silently. Restores nothing reactive where the derived set did
    /// not move.
    ///
    /// Scan-free by construction — it installs a remembered answer rather
    /// than recomputing one.
    pub fn restore_filters(&mut self, snapshot: FilterSnapshot) -> Result<u32, FilterError> {
        if self.is_inside_custom_call() {
            return Err(FilterError::MutationDuringCustomCall);
        }
        let sheet_count = self.sheets.len();
        let mut wanted: Vec<Option<SheetFilterState>> = (0..sheet_count).map(|_| None).collect();
        for entry in snapshot.into_sheets() {
            if entry.sheet_index >= sheet_count {
                continue; // captured against a wider workbook
            }
            let index = entry.sheet_index;
            wanted[index] = Some(entry);
        }
        let mut restored = 0u32;
        for (sheet_index, entry) in wanted.into_iter().enumerate() {
            let (rules, hidden) = match entry {
                Some(entry) => {
                    restored += 1;
                    (entry.rules, entry.hidden_rows.into_iter().collect())
                }
                None => (Vec::new(), BTreeSet::new()),
            };
            if self.sheets[sheet_index].commit_filter(rules, hidden) {
                self.republish_hidden(sheet_index);
            }
        }
        Ok(restored)
    }
}
