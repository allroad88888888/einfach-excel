//! workbook table totals operations.

use super::*;

impl Workbook {
    pub fn set_table_totals_row(&mut self, name: &str, enabled: bool) -> Result<(), TableError> {
        if self.is_inside_custom_call() {
            return Err(TableError::MutationDuringCustomCall);
        }
        let key = name.to_ascii_uppercase();
        let Some(entry) = self.tables.get(&key) else {
            return Err(TableError::NotFound);
        };
        if entry.has_totals == enabled {
            return Ok(()); // idempotent no-op
        }
        let sheet_name = entry.sheet_name.clone();
        let range = entry.range.normalize();
        let sheet_index = match self.index_of(&sheet_name) {
            Some(i) => i,
            // A Table anchored to a missing sheet shouldn't happen (the
            // sheet-lifecycle hooks keep the anchor valid), but fail closed
            // rather than panic.
            None => return Err(TableError::NotFound),
        };

        if enabled {
            let totals_row = range.end.row + 1;
            // Occupancy guard: the row below the Table, across its columns.
            if self.range_has_content(
                sheet_index,
                CellRange::new(
                    CellAddress::new(totals_row, range.start.col),
                    CellAddress::new(totals_row, range.end.col),
                ),
            ) {
                return Err(TableError::TotalsRowBlocked);
            }
            // Grow the range + flip the flag, then publish the new geometry
            // BEFORE writing the SUBTOTAL formula so its `Table[Col]` (= the
            // #Data band, which now correctly EXCLUDES the totals row)
            // resolves against current geometry on first evaluation.
            let (canonical, last_col_name, last_col_idx) = {
                let e = self.tables.get_mut(&key).expect("existence checked above");
                e.range =
                    CellRange::new(e.range.start, CellAddress::new(totals_row, range.end.col));
                e.has_totals = true;
                let last_idx = e.columns.len().saturating_sub(1);
                (
                    e.canonical_name.clone(),
                    e.columns.last().cloned(),
                    last_idx,
                )
            };
            self.bump_tables_epoch();
            // Excel default: SUM (109) in the LAST column only.
            if let Some(col_name) = last_col_name {
                let addr = CellAddress::new(totals_row, range.start.col + last_col_idx as u32);
                let text = totals_subtotal_formula(&canonical, &col_name, 109);
                self.set_formula(sheet_index, &addr.to_string_repr(), &text);
            }
        } else {
            // Toggle off: clear the totals-row cells (current last row of the
            // range), then shrink and flip the flag.
            let totals_row = range.end.row;
            for i in 0..range.cols() {
                let addr = CellAddress::new(totals_row, range.start.col + i);
                self.clear_cell(sheet_index, &addr.to_string_repr());
            }
            {
                let e = self.tables.get_mut(&key).expect("existence checked above");
                let new_end_row = e.range.end.row.saturating_sub(1);
                e.range = CellRange::new(
                    e.range.start,
                    CellAddress::new(new_end_row, e.range.end.col),
                );
                e.has_totals = false;
            }
            self.bump_tables_epoch();
        }
        Ok(())
    }

    /// Set (or clear) the aggregate function of one totals-row column
    /// (design doc #32 §7). The Table must already have a totals row
    /// ([`TableError::NoTotalsRow`] otherwise). `func == TotalsFunction::None`
    /// clears the cell; any other variant writes `=SUBTOTAL(1xx, Table[Col])`
    /// with the 101-111 hidden-excluding code (§6 / §7). The written formula
    /// is the single source of truth — the registry stores no per-column
    /// selection, so a UI reconstructs the dropdown state by reading the
    /// cell's formula back.
    ///
    /// `TableError::NotFound` for an unknown Table, `ColumnNotFound` for an
    /// unknown column; guarded against re-entrant custom-formula calls.
    pub fn set_table_total_function(
        &mut self,
        name: &str,
        column: &str,
        func: TotalsFunction,
    ) -> Result<(), TableError> {
        if self.is_inside_custom_call() {
            return Err(TableError::MutationDuringCustomCall);
        }
        let key = name.to_ascii_uppercase();
        let Some(entry) = self.tables.get(&key) else {
            return Err(TableError::NotFound);
        };
        if !entry.has_totals {
            return Err(TableError::NoTotalsRow);
        }
        let col_idx = entry
            .columns
            .iter()
            .position(|c| c.eq_ignore_ascii_case(column))
            .ok_or(TableError::ColumnNotFound)?;
        let range = entry.range.normalize();
        let sheet_name = entry.sheet_name.clone();
        let canonical = entry.canonical_name.clone();
        // Use the registry's canonical column casing in the generated
        // formula (not the caller's), so re-reads are stable and the rename
        // walker matches it.
        let col_name = entry.columns[col_idx].clone();
        let sheet_index = match self.index_of(&sheet_name) {
            Some(i) => i,
            None => return Err(TableError::NotFound),
        };
        let totals_row = range.end.row;
        let addr = CellAddress::new(totals_row, range.start.col + col_idx as u32);
        match func.subtotal_code() {
            None => self.clear_cell(sheet_index, &addr.to_string_repr()),
            Some(code) => {
                let text = totals_subtotal_formula(&canonical, &col_name, code);
                self.set_formula(sheet_index, &addr.to_string_repr(), &text);
            }
        }
        Ok(())
    }

    /// True iff any cell inside `range` on `sheet_index` holds a non-empty
    /// primitive or a formula. Used by the totals-row occupancy guard.
    fn range_has_content(&self, sheet_index: usize, range: CellRange) -> bool {
        let Some(sheet) = self.sheets.get(sheet_index) else {
            return false;
        };
        let mut occupied = false;
        sheet.for_each_non_empty_in_range(range, |_| {
            occupied = true;
        });
        occupied
    }
}
