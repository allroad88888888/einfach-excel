//! 普通区域与 Table 共用数据行扫描；只计算候选隐藏集合，不修改任何筛选状态。
use super::*;
use crate::advanced_filter::FilterCriteria;
use crate::filter::{prepared_colors::PreparedColors, scan_day::FilterScanDay};

impl Workbook {
    pub(crate) fn scan_filter_data_criteria(&self, sheet: usize, data: Option<CellRange>,
        criteria: FilterCriteria<'_>) -> Result<FilterApplyReport, FilterError> {
        self.scan_filter_data_criteria_on(sheet, data, criteria, &FilterScanDay::default())
    }

    pub(super) fn scan_filter_data_criteria_on(&self, sheet: usize, data: Option<CellRange>,
        criteria: FilterCriteria<'_>, day: &FilterScanDay) -> Result<FilterApplyReport, FilterError> {
        criteria.validate()?;
        let source = self.sheet(sheet).ok_or(FilterError::InvalidSheet)?;
        let today = day.for_criteria(criteria)?;
        let Some(data) = data.filter(|_| !criteria.is_empty()) else {
            return Ok(FilterApplyReport::default());
        };
        let cols = criteria.columns();
        let rows = data.rows();
        let predicate_cells = rows.saturating_mul(cols.len() as u32);
        if predicate_cells > crate::filter::MAX_FILTER_PREDICATE_CELLS {
            return Err(FilterError::SourceTooLarge {
                rows, columns: cols.len() as u32, predicate_cells,
            });
        }
        source.note_filter_scan();
        let mut values = HashMap::new();
        for &col in &cols {
            let column = CellRange::new(CellAddress::new(data.start.row, col),
                CellAddress::new(data.end.row, col));
            self.for_each_sparse_range_cell(sheet, column, |addr, value| {
                values.insert((addr.row, addr.col), value);
            });
        }
        self.store.settle_pending_reads();
        let data_rows = data.start.row..=data.end.row;
        let colors = PreparedColors::scan(self, sheet, data_rows.clone(), criteria, today)?;
        self.store.settle_pending_reads();
        let prepared = crate::filter::prepared::PreparedFilter::new(criteria, data_rows, &values, today)
            .with_colors(colors);
        let hidden_rows = (data.start.row..=data.end.row)
            .filter(|row| !prepared.matches(*row, &values)).collect();
        Ok(FilterApplyReport { hidden_rows, scanned_rows: rows, predicate_cells })
    }
}
