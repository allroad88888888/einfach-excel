//! Read the complete source before turning matches into visibility or output.
use super::range_conditions::CriteriaRows;
use super::range_records::RecordKey;
use crate::advanced_filter::range_contract::{
    validate_data_range, AdvancedFilterSelection, MAX_CONDITION_EVALUATIONS, MAX_RECORD_CELLS,
};
use crate::sheet::collapse_array_for_eval;
use crate::{value_to_display, CellAddress, CellRange, FilterError, Workbook};
use einfach_core::Value;
use std::collections::{HashMap, HashSet};

pub(super) struct AdvancedFilterScan {
    values: Vec<Value>,
    range: CellRange,
    pub(super) columns: HashMap<String, usize>,
    pub(super) matched_rows: Vec<u32>,
    pub(super) predicate_cells: u32,
}

impl AdvancedFilterScan {
    pub(super) fn record(&self, row: u32) -> &[Value] {
        let width = self.range.cols() as usize;
        let offset = (row - self.range.start.row) as usize * width;
        &self.values[offset..offset + width]
    }
}

impl Workbook {
    pub(super) fn scan_advanced_filter(
        &self,
        selection: AdvancedFilterSelection,
    ) -> Result<AdvancedFilterScan, FilterError> {
        let result = self.read_advanced_filter(selection);
        self.store.settle_pending_reads();
        result
    }

    fn read_advanced_filter(
        &self,
        selection: AdvancedFilterSelection,
    ) -> Result<AdvancedFilterScan, FilterError> {
        let source = selection.source;
        let range = source.range;
        validate_data_range(range, MAX_RECORD_CELLS)?;
        let sheet = self.sheet(source.sheet).ok_or(FilterError::InvalidSheet)?;
        let header = CellRange::new(
            range.start,
            CellAddress::new(range.start.row, range.end.col),
        );
        if sheet
            .merged_ranges()
            .iter()
            .any(|merged| merged.intersects(header))
        {
            return Err(FilterError::InvalidCriteria(
                "Use a separate heading for each source field.",
            ));
        }

        let width = range.cols() as usize;
        let mut values = vec![Value::Null; range.cell_count() as usize];
        self.for_each_sparse_range_cell(source.sheet, range, |address, value| {
            let offset = (address.row - range.start.row) as usize * width
                + (address.col - range.start.col) as usize;
            values[offset] = collapse_array_for_eval(value);
        });

        let mut columns = HashMap::with_capacity(width);
        for (index, value) in values[..width].iter().enumerate() {
            let name = value_to_display(value).to_lowercase();
            if matches!(value, Value::Error(_))
                || name.trim().is_empty()
                || columns.insert(name, index).is_some()
            {
                return Err(FilterError::InvalidCriteria(
                    "Use nonempty, distinct source headings.",
                ));
            }
        }

        let criteria = selection
            .criteria
            .map(|reference| CriteriaRows::compile(self, reference, &columns))
            .transpose()?;
        let first_data_row = range.start.row + 1;
        let predicate_cells = (range.rows() as usize - 1)
            * criteria
                .as_ref()
                .map_or(0, |criteria| criteria.condition_count);
        if predicate_cells > MAX_CONDITION_EVALUATIONS {
            return Err(FilterError::InvalidCriteria(
                "Use a smaller source or fewer criteria.",
            ));
        }

        let mut seen = HashSet::new();
        let mut matched_rows = Vec::new();
        for (index, record) in values.chunks_exact(width).skip(1).enumerate() {
            let row = first_data_row + index as u32;
            let anchor = CellAddress::new(row, range.start.col);
            if criteria
                .as_ref()
                .is_some_and(|criteria| !criteria.matches(self, first_data_row, anchor, record))
            {
                continue;
            }
            if !selection.unique_only || seen.insert(RecordKey::from(record)) {
                matched_rows.push(row);
            }
        }
        drop(seen);
        Ok(AdvancedFilterScan {
            values,
            range,
            columns,
            matched_rows,
            predicate_cells: predicate_cells as u32,
        })
    }
}
