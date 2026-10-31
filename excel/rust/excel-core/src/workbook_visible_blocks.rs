//! “仅可见单元格”：把选区拆成未被隐藏的行段 × 列段矩形块，隐藏集合由原生工作表持有。
use crate::outline::OutlineAxis;
use crate::{CellAddress, CellRange, Workbook};
use std::collections::BTreeSet;

/// 不重叠的可见矩形；顺序为输入范围顺序，范围内先行段后列段。
#[derive(Debug, PartialEq, Eq)]
pub struct VisibleBlocks {
    pub blocks: Vec<CellRange>,
    pub cell_count: u64,
}

/// 范围内的可见区间：从 `start..=end` 中去掉有序隐藏集合。
fn visible_spans(start: u32, end: u32, hidden: &BTreeSet<u32>) -> Vec<(u32, u32)> {
    let mut spans = Vec::new();
    let mut cursor = start;
    for &index in hidden.range(start..=end) {
        if index > cursor {
            spans.push((cursor, index - 1));
        }
        cursor = index + 1;
    }
    if cursor <= end {
        spans.push((cursor, end));
    }
    spans
}

impl Workbook {
    /// 手动、筛选与折叠分组三类隐藏都算隐藏；只读，不改变任何可见性。
    pub fn visible_blocks(
        &self,
        sheet: usize,
        ranges: &[CellRange],
        block_limit: usize,
    ) -> Result<VisibleBlocks, &'static str> {
        let source = self.sheet(sheet).ok_or("Invalid select-special worksheet.")?;
        if ranges.is_empty() || block_limit == 0 {
            return Err("Invalid select-special range.");
        }
        let mut rows: BTreeSet<u32> = source.hidden_rows().into_iter().collect();
        rows.extend(source.filter_hidden_rows());
        rows.extend(source.outline().hidden_indices(OutlineAxis::Row));
        let mut cols: BTreeSet<u32> = source.hidden_columns().into_iter().collect();
        cols.extend(source.outline().hidden_indices(OutlineAxis::Column));
        let mut result = VisibleBlocks { blocks: Vec::new(), cell_count: 0 };
        for range in ranges {
            if *range != range.normalize()
                || range.end.row >= crate::sheet::EXCEL_MAX_ROWS
                || range.end.col >= crate::sheet::EXCEL_MAX_COLS
            {
                return Err("Invalid select-special range.");
            }
            let row_spans = visible_spans(range.start.row, range.end.row, &rows);
            let col_spans = visible_spans(range.start.col, range.end.col, &cols);
            if row_spans.len().saturating_mul(col_spans.len())
                > block_limit.saturating_sub(result.blocks.len())
            {
                return Err("Too many separate areas. Select a smaller range and try again.");
            }
            for &(r0, r1) in &row_spans {
                for &(c0, c1) in &col_spans {
                    result.cell_count += u64::from(r1 - r0 + 1) * u64::from(c1 - c0 + 1);
                    result.blocks.push(CellRange::new(
                        CellAddress::new(r0, c0),
                        CellAddress::new(r1, c1),
                    ));
                }
            }
        }
        Ok(result)
    }
}
