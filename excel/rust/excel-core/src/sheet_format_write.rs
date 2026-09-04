//! 三类样式的写入，以及行列交叉点的冲突物化。

use super::*;
use crate::cell_style::{CellStyle, StyleScope};

impl Sheet {
    /// 兼容旧 API：把完整格式作为一个单元格的完整覆盖。
    pub fn set_format(&mut self, addr_str: &str, format: CellFormat) {
        let addr = CellAddress::parse(addr_str).expect("invalid cell address");
        if format == CellFormat::default() {
            self.cell_styles.remove(&addr);
        } else {
            self.cell_styles
                .insert(addr, CellStyle::from_format(format));
        }
        self.notify_style_subscribers(|candidate| candidate == addr);
    }

    /// 兼容旧 API：完整格式按单元格写入，不再建立永久矩形层。
    pub fn set_format_range(&mut self, range: CellRange, format: CellFormat) -> usize {
        let normalized = range.normalize();
        let style = CellStyle::from_format(format.clone());
        for addr in normalized.iter() {
            if format == CellFormat::default() {
                self.cell_styles.remove(&addr);
            } else {
                self.cell_styles.insert(addr, style.clone());
            }
        }
        self.notify_style_subscribers(|addr| normalized.contains(addr))
    }

    /// 只修改 patch 明确携带的属性。
    pub fn patch_format_range(
        &mut self,
        range: CellRange,
        scope: StyleScope,
        patch: CellStyle,
    ) -> usize {
        if patch.is_empty() {
            return 0;
        }
        let normalized = range.normalize();
        match scope {
            StyleScope::Cell => self.patch_cells(normalized, &patch),
            StyleScope::Row => self.patch_rows(normalized.start.row, normalized.end.row, &patch),
            StyleScope::Column => {
                self.patch_columns(normalized.start.col, normalized.end.col, &patch)
            }
        }
        self.notify_style_subscribers(|addr| match scope {
            StyleScope::Cell => normalized.contains(addr),
            StyleScope::Row => (normalized.start.row..=normalized.end.row).contains(&addr.row),
            StyleScope::Column => (normalized.start.col..=normalized.end.col).contains(&addr.col),
        })
    }

    fn patch_cells(&mut self, range: CellRange, patch: &CellStyle) {
        for addr in range.iter() {
            self.cell_styles.entry(addr).or_default().apply_patch(patch);
        }
    }

    fn patch_rows(&mut self, start: u32, end: u32, patch: &CellStyle) {
        let direct_cells: Vec<CellAddress> = self
            .cell_styles
            .iter()
            .filter_map(|(addr, style)| {
                ((start..=end).contains(&addr.row) && style.overlaps(patch)).then_some(*addr)
            })
            .collect();
        for addr in direct_cells {
            self.cell_styles.get_mut(&addr).unwrap().apply_patch(patch);
        }

        let conflicting_columns: Vec<u32> = self
            .column_styles
            .iter()
            .filter_map(|(column, style)| style.overlaps(patch).then_some(*column))
            .collect();
        for row in start..=end {
            for column in &conflicting_columns {
                self.cell_styles
                    .entry(CellAddress::new(row, *column))
                    .or_default()
                    .apply_patch(patch);
            }
            self.row_styles.entry(row).or_default().apply_patch(patch);
        }
    }

    fn patch_columns(&mut self, start: u32, end: u32, patch: &CellStyle) {
        let direct_cells: Vec<CellAddress> = self
            .cell_styles
            .iter()
            .filter_map(|(addr, style)| {
                ((start..=end).contains(&addr.col) && style.overlaps(patch)).then_some(*addr)
            })
            .collect();
        for addr in direct_cells {
            self.cell_styles.get_mut(&addr).unwrap().apply_patch(patch);
        }

        let conflicting_rows: Vec<u32> = self
            .row_styles
            .iter()
            .filter_map(|(row, style)| style.overlaps(patch).then_some(*row))
            .collect();
        for column in start..=end {
            for row in &conflicting_rows {
                self.cell_styles
                    .entry(CellAddress::new(*row, column))
                    .or_default()
                    .apply_patch(patch);
            }
            self.column_styles
                .entry(column)
                .or_default()
                .apply_patch(patch);
        }
    }

    fn notify_style_subscribers(&self, includes: impl Fn(CellAddress) -> bool) -> usize {
        let addrs: Vec<CellAddress> = self
            .cell_subscriptions
            .keys()
            .copied()
            .filter(|addr| includes(*addr))
            .collect();
        for addr in &addrs {
            self.notify_address_subscribers(*addr);
        }
        addrs.len()
    }
}
