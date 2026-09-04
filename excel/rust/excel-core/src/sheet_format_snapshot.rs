//! 格式 undo 与持久化使用的稀疏快照。

use super::*;
use crate::cell_style::{CellStyle, RowStyle};

#[derive(Clone, Debug)]
pub struct FormatRangeSnapshot {
    pub range: CellRange,
    pub cell_styles: Vec<(CellAddress, CellStyle)>,
    pub row_styles: Vec<(u32, RowStyle)>,
    pub column_styles: Vec<(u32, CellStyle)>,
}

impl Sheet {
    pub fn snapshot_format_range(&self, range: CellRange) -> FormatRangeSnapshot {
        let normalized = range.normalize();
        let mut cell_styles: Vec<_> = self
            .cell_styles
            .iter()
            .filter_map(|(addr, style)| {
                normalized.contains(*addr).then_some((*addr, style.clone()))
            })
            .collect();
        cell_styles.sort_by_key(|(addr, _)| (addr.row, addr.col));

        FormatRangeSnapshot {
            range: normalized,
            cell_styles,
            row_styles: self
                .row_styles
                .range(normalized.start.row..=normalized.end.row)
                .map(|(row, style)| (*row, style.clone()))
                .collect(),
            column_styles: self
                .column_styles
                .range(normalized.start.col..=normalized.end.col)
                .map(|(column, style)| (*column, style.clone()))
                .collect(),
        }
    }

    pub fn restore_format_range_snapshot(&mut self, snapshot: FormatRangeSnapshot) -> usize {
        let range = snapshot.range.normalize();
        self.cell_styles.retain(|addr, _| !range.contains(*addr));
        self.cell_styles.extend(snapshot.cell_styles);
        self.row_styles
            .retain(|row, _| !(range.start.row..=range.end.row).contains(row));
        self.row_styles.extend(snapshot.row_styles);
        self.column_styles
            .retain(|column, _| !(range.start.col..=range.end.col).contains(column));
        self.column_styles.extend(snapshot.column_styles);

        let addrs: Vec<_> = self
            .cell_subscriptions
            .keys()
            .copied()
            .filter(|addr| range.contains(*addr))
            .collect();
        for addr in &addrs {
            self.notify_address_subscribers(*addr);
        }
        addrs.len()
    }
}
