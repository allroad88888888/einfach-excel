//! 普通区域与 Table 共用数据行扫描；只计算候选隐藏集合，不修改任何筛选状态。
use super::*;

impl Workbook {
    pub(super) fn scan_filter_data(
        &self, sheet: usize, data: Option<CellRange>, rules: &[ColumnFilterRule],
    ) -> Result<FilterApplyReport, FilterError> {
        let source = self.sheet(sheet).ok_or(FilterError::InvalidSheet)?;
        let Some(data) = data.filter(|_| !rules.is_empty()) else {
            return Ok(FilterApplyReport::default());
        };
        let cols: BTreeSet<u32> = rules.iter().map(ColumnFilterRule::col_index).collect();
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
                values.insert((addr.row, addr.col), crate::value_to_display(&value));
            });
        }
        self.store.settle_pending_reads();
        let hidden_rows = (data.start.row..=data.end.row).filter(|row| {
            !crate::filter::row_matches_rules(rules, |col|
                values.get(&(*row, col)).cloned().unwrap_or_default())
        }).collect();
        Ok(FilterApplyReport { hidden_rows, scanned_rows: rows, predicate_cells })
    }
}
