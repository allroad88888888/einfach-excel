//! Publish the matches through the worksheet's existing filter projection.
use super::*;
use crate::advanced_filter::range_contract::{AdvancedFilterSelection, FilterRangeRef};
use crate::advanced_filter::range_state::{FilterCriteriaState, PersistedFilterCriteria};
use crate::filter::SheetAutoFilter;

impl Workbook {
    pub fn apply_advanced_filter_range(
        &mut self,
        selection: AdvancedFilterSelection,
    ) -> Result<FilterApplyReport, FilterError> {
        let source = selection.source;
        if self.is_inside_custom_call() {
            return Err(FilterError::MutationDuringCustomCall);
        }
        self.sheet(source.sheet).ok_or(FilterError::InvalidSheet)?;
        self.ensure_sheet_unprotected(source.sheet)
            .map_err(|_| FilterError::ProtectedWorksheet)?;
        if self.tables.values().any(|table| {
            Some(table.sheet_name()) == self.name(source.sheet)
                && table.range().intersects(source.range)
        }) {
            return Err(FilterError::InvalidCriteria(
                "Choose a source outside Excel Tables for in-place filtering.",
            ));
        }
        let criteria = FilterCriteriaState::new(self, selection.criteria, selection.unique_only)?;
        let scan = self.scan_advanced_filter(selection)?;
        let mut matched = scan.matched_rows.into_iter().peekable();
        let hidden: BTreeSet<_> = (source.range.start.row + 1..=source.range.end.row)
            .filter(|row| {
                if matched.peek() == Some(row) {
                    matched.next();
                    false
                } else {
                    true
                }
            })
            .collect();
        let report = FilterApplyReport {
            hidden_rows: hidden.iter().copied().collect(),
            scanned_rows: source.range.rows() - 1,
            predicate_cells: scan.predicate_cells,
        };
        self.sheets[source.sheet].note_filter_scan();
        let filter = SheetAutoFilter::new_range_criteria(source.range, criteria, hidden);
        if self.sheets[source.sheet].commit_filter_state(Some(filter)) {
            self.republish_hidden(source.sheet);
        }
        Ok(report)
    }

    pub fn filter_range_criteria(&self, sheet: usize) -> Option<PersistedFilterCriteria> {
        self.sheet(sheet)?
            .filter()?
            .range_criteria()
            .map(|criteria| criteria.snapshot(self))
    }

    pub(in crate::workbook) fn current_advanced_filter_range(
        &self,
        sheet: usize,
    ) -> Result<Option<AdvancedFilterSelection>, FilterError> {
        let Some(filter) = self.sheet(sheet).ok_or(FilterError::InvalidSheet)?.filter() else {
            return Ok(None);
        };
        let Some(criteria) = filter.range_criteria() else {
            return Ok(None);
        };
        let range = filter.range().ok_or(FilterError::InvalidRange)?;
        Ok(Some(AdvancedFilterSelection {
            source: FilterRangeRef { sheet, range },
            criteria: criteria.resolve(self)?,
            unique_only: criteria.unique_only,
        }))
    }
}
