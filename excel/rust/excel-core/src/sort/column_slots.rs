//! Validate a left-to-right sort and retain existing hidden column positions.

use crate::outline::OutlineAxis;
use crate::{CellRange, Workbook};
use std::collections::BTreeSet;

use super::axis::SortAxis;
use super::SortRangeError;

impl Workbook {
    pub(super) fn sort_column_slots(
        &self,
        sheet: usize,
        range: CellRange,
        rows: impl Iterator<Item = u32>,
    ) -> Result<Vec<u32>, SortRangeError> {
        let source = self.sheet(sheet).ok_or(SortRangeError::InvalidRange)?;
        if range.cols() < 2 || u64::from(range.rows()) * u64::from(range.cols()) > 1_048_576 {
            return Err(SortRangeError::InvalidRange);
        }
        let axis = SortAxis::Columns;
        source.validate_sort_layout(range, axis, rows)?;
        if self.tables.values().any(|table| {
            Some(table.sheet_name()) == self.name(sheet) && table.range().intersects(range)
        }) {
            return Err(SortRangeError::TableIntersectsRange);
        }
        if source.filter().is_some_and(|filter| filter.has_conditions() &&
            filter.range().is_none_or(|scope| scope.intersects(range))) {
            return Err(SortRangeError::FilterIntersectsRange);
        }
        let mut hidden: BTreeSet<u32> = source.hidden_columns().into_iter().collect();
        hidden.extend(source.outline().hidden_indices(OutlineAxis::Column));
        Ok(axis.slots(range).filter(|column| !hidden.contains(column)).collect())
    }
}
