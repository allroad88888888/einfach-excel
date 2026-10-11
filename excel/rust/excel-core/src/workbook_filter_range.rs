//! 显式筛选区域：首行是表头，仅判断区域内数据行，不猜测 Total/Summary。
use super::*;

pub(super) fn validate_filter_range(
    range: CellRange,
    rules: &[ColumnFilterRule],
) -> Result<(), FilterError> {
    if range.start.row >= range.end.row
        || range.start.col > range.end.col
        || range.end.row >= crate::sheet::EXCEL_MAX_ROWS
        || range.end.col >= crate::sheet::EXCEL_MAX_COLS
        || rules
            .iter()
            .any(|rule| rule.col_index() < range.start.col || rule.col_index() > range.end.col)
    {
        return Err(FilterError::InvalidRange);
    }
    Ok(())
}

impl Workbook {
    pub fn filter_range(&self, sheet: usize) -> Option<CellRange> {
        self.sheet(sheet)
            .and_then(Sheet::filter)
            .and_then(|filter| filter.range())
    }

    /// 先验证、扫描，再一次提交。空条件保留区域和表头按钮，不等同于关闭筛选。
    pub fn apply_filter_range(
        &mut self,
        sheet: usize,
        range: CellRange,
        rules: &[ColumnFilterRule],
    ) -> Result<FilterApplyReport, FilterError> {
        if self.is_inside_custom_call() {
            return Err(FilterError::MutationDuringCustomCall);
        }
        self.sheet(sheet).ok_or(FilterError::InvalidSheet)?;
        validate_filter_range(range, rules)?;
        let data = CellRange::new(CellAddress::new(range.start.row + 1, range.start.col), range.end);
        let report = self.scan_filter_data(sheet, Some(data), rules)?;
        let mut state = crate::filter::SheetAutoFilter::new(
            rules.to_vec(), report.hidden_rows.iter().copied().collect());
        state.range = Some(range);
        if self.sheets[sheet].commit_filter_state(Some(state)) {
            self.republish_hidden(sheet);
        }
        Ok(report)
    }
}
