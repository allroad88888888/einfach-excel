//! 合并矩形的唯一存储与结构位移；不把合并当成单元格值或行列尺寸。
use super::*;
use crate::shift::ShiftEdit;

impl Sheet {
    pub fn merged_ranges(&self) -> &[CellRange] {
        &self.merged_ranges
    }

    /// 恢复稀疏合并元数据；先完整校验，不能用导入悄悄覆盖已有内容。
    /// 只扫描范围内已存储的地址，不展开空白矩形或求值惰性公式。
    pub fn restore_merged_ranges(&mut self, ranges: Vec<CellRange>) -> Result<(), &'static str> {
        for (index, range) in ranges.iter().enumerate() {
            if range.start.row > range.end.row
                || range.start.col > range.end.col
                || range.end.row >= EXCEL_MAX_ROWS
                || range.end.col >= EXCEL_MAX_COLS
                || range.start == range.end
            {
                return Err("Invalid persisted merge range.");
            }
            if ranges[..index].iter().any(|other| other.intersects(*range)) {
                return Err("Persisted merge ranges overlap.");
            }
            let mut covered_content = false;
            self.for_each_non_empty_in_range(*range, |addr| {
                // 批量恢复可能已经生成数组子格；它们不是用户内容，下面会按合并几何重新投影。
                covered_content |= addr != range.start && !self.is_spilled(addr);
            });
            if covered_content {
                return Err("Persisted merge covers cell content.");
            }
        }
        self.restore_merge_geometry(
            CellRange::new(
                CellAddress::new(0, 0),
                CellAddress::new(EXCEL_MAX_ROWS - 1, EXCEL_MAX_COLS - 1),
            ),
            &ranges,
        );
        Ok(())
    }

    /// 返回整个相交矩形，锚点在视口外时也能正确投影。
    pub fn merges_in_range(&self, range: CellRange) -> Vec<CellRange> {
        self.merged_ranges
            .iter()
            .copied()
            .filter(|r| r.intersects(range))
            .collect()
    }

    pub fn merged_range_at(&self, addr: CellAddress) -> Option<CellRange> {
        self.merged_ranges
            .iter()
            .copied()
            .find(|range| range.contains(addr))
    }

    pub(crate) fn validate_merge_range(&self, range: CellRange) -> Result<(), &'static str> {
        if range.start.row > range.end.row
            || range.start.col > range.end.col
            || range.end.row >= EXCEL_MAX_ROWS
            || range.end.col >= EXCEL_MAX_COLS
        {
            return Err("Invalid merge range.");
        }
        if self
            .merged_ranges
            .iter()
            .any(|r| r.intersects(range) && (!range.contains(r.start) || !range.contains(r.end)))
        {
            return Err("Select the entire existing merged cell before merging.");
        }
        Ok(())
    }

    pub(crate) fn replace_merges_in_range(&mut self, range: CellRange, merges: &[CellRange]) {
        self.merged_ranges.retain(|r| !r.intersects(range));
        self.merged_ranges.extend_from_slice(merges);
        self.merged_ranges
            .sort_unstable_by_key(|r| (r.start.row, r.start.col));
    }

    /// 几何历史只重算 spill 锚点，不扫描原始单元格来回放空的内容快照。
    pub(crate) fn restore_merge_geometry(&mut self, range: CellRange, merges: &[CellRange]) {
        let mut anchors = self.teardown_all_spills();
        anchors.extend(self.teardown_blocked_spill_anchors());
        self.replace_merges_in_range(range, merges);
        self.project_bulk_spill_anchors(anchors);
    }

    pub(super) fn shift_merges(&mut self, edit: ShiftEdit) {
        self.merged_ranges =
            self.merged_ranges
                .iter()
                .filter_map(|range| {
                    let mut next = *range;
                    let (lo, hi) = if edit.is_row_edit() {
                        (&mut next.start.row, &mut next.end.row)
                    } else {
                        (&mut next.start.col, &mut next.end.col)
                    };
                    let (at, count, insert) =
                        match edit {
                            ShiftEdit::RowInsert { at, count }
                            | ShiftEdit::ColInsert { at, count } => (at, count, true),
                            ShiftEdit::RowDelete { at, count }
                            | ShiftEdit::ColDelete { at, count } => (at, count, false),
                        };
                    if insert {
                        if at <= *lo {
                            *lo += count;
                        }
                        if at <= *hi {
                            *hi += count;
                        }
                    } else if *lo >= at + count {
                        *lo -= count;
                        *hi -= count;
                    } else if *hi >= at {
                        let left = at.saturating_sub(*lo);
                        let right = (*hi + 1).saturating_sub(at + count);
                        if left + right == 0 {
                            return None;
                        }
                        *lo = (*lo).min(at);
                        *hi = *lo + left + right - 1;
                    }
                    (next.start != next.end).then_some(next)
                })
                .collect();
    }
}
