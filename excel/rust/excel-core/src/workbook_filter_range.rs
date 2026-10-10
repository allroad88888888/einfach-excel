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
        let source = self.sheet(sheet).ok_or(FilterError::InvalidSheet)?;
        validate_filter_range(range, rules)?;
        let cols: BTreeSet<u32> = rules.iter().map(ColumnFilterRule::col_index).collect();
        let rows = range.rows() - 1;
        let predicate_cells = rows.saturating_mul(cols.len() as u32);
        if predicate_cells > crate::filter::MAX_FILTER_PREDICATE_CELLS {
            return Err(FilterError::SourceTooLarge {
                rows,
                columns: cols.len() as u32,
                predicate_cells,
            });
        }
        let mut hidden = BTreeSet::new();
        if !rules.is_empty() {
            source.note_filter_scan();
            let mut values = HashMap::new();
            for &col in &cols {
                let column = CellRange::new(
                    CellAddress::new(range.start.row + 1, col),
                    CellAddress::new(range.end.row, col),
                );
                self.for_each_sparse_range_cell(sheet, column, |addr, value| {
                    values.insert((addr.row, addr.col), crate::value_to_display(&value));
                });
            }
            self.store.settle_pending_reads();
            for row in range.start.row + 1..=range.end.row {
                if !crate::filter::row_matches_rules(rules, |col| {
                    values.get(&(row, col)).cloned().unwrap_or_default()
                }) {
                    hidden.insert(row);
                }
            }
        }
        let report = FilterApplyReport {
            hidden_rows: hidden.iter().copied().collect(),
            scanned_rows: if rules.is_empty() { 0 } else { rows },
            predicate_cells,
        };
        let mut state = crate::filter::SheetAutoFilter::new(rules.to_vec(), hidden);
        state.range = Some(range);
        if self.sheets[sheet].commit_filter_state(Some(state)) {
            self.republish_hidden(sheet);
        }
        Ok(report)
    }
}
