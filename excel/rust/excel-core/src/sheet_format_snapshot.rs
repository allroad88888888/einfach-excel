//! 格式 undo 与持久化使用的稀疏快照。

use super::*;
use crate::cell_style::{CellStyle, RowStyle};

#[derive(Clone, Debug, PartialEq)]
pub struct FormatRangeSnapshot {
    pub range: CellRange,
    pub cell_styles: Vec<(CellAddress, CellStyle)>,
    pub row_styles: Vec<(u32, RowStyle)>,
    pub column_styles: Vec<(u32, CellStyle)>,
}

impl Sheet {
    pub fn snapshot_format_range(&self, range: CellRange) -> FormatRangeSnapshot {
        let normalized = range.normalize();
        // 单格编辑的历史只查询当前格，不能为一次输入扫描全部 cellStyle。
        if normalized.start == normalized.end {
            return FormatRangeSnapshot {
                range: normalized,
                cell_styles: self
                    .cell_styles
                    .get(&normalized.start)
                    .map(|style| vec![(normalized.start, style.clone())])
                    .unwrap_or_default(),
                row_styles: self
                    .row_styles
                    .get(&normalized.start.row)
                    .map(|style| vec![(normalized.start.row, style.clone())])
                    .unwrap_or_default(),
                column_styles: self
                    .column_styles
                    .get(&normalized.start.col)
                    .map(|style| vec![(normalized.start.col, style.clone())])
                    .unwrap_or_default(),
            };
        }
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
        if range.start == range.end {
            self.cell_styles.remove(&range.start);
            self.cell_styles.extend(snapshot.cell_styles);
            self.row_styles.remove(&range.start.row);
            self.row_styles.extend(snapshot.row_styles);
            self.column_styles.remove(&range.start.col);
            self.column_styles.extend(snapshot.column_styles);
            self.notify_address_subscribers(range.start);
            return usize::from(self.cell_subscriptions.contains_key(&range.start));
        }
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
