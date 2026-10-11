//! 筛选区域随行列插删位移；不重新计算匹配结果，删除表头即移除区域。
use super::*;
use crate::{shift::ShiftEdit, ColumnFilterRule};
use crate::shift::shift_interval;

impl crate::filter::SheetAutoFilter {
    /// 局部腾位只搬完整列带内的显式区域；其它筛选保留原矩形与隐藏快照。
    /// 不扫描或重算条件，插入的新行默认可见，手动隐藏仍是工作表行属性。
    pub(crate) fn after_row_band_insert(
        &self, row: u32, columns: (u32, u32), row_count: u32,
    ) -> Result<Option<Self>, &'static str> {
        let mut after = self.clone();
        if let Some(mut range) = self.range() {
            if range.end.row < row || range.start.col < columns.0 || range.end.col > columns.1 {
                return Ok(None);
            }
            if range.end.row + 1 >= row_count {
                return Err("The header insertion would move the filter outside this worksheet.");
            }
            range.start.row += u32::from(range.start.row >= row);
            range.end.row += 1;
            after.range = Some(range);
        } else if columns != (0, EXCEL_MAX_COLS - 1) {
            // 旧整表筛选没有局部范围；只有整行真的移动时才移动它的隐藏快照。
            return Ok(None);
        }
        if self.hidden_set().iter().any(|hidden| *hidden >= row
            && hidden.checked_add(1).is_none_or(|next| next >= row_count)) {
            return Err("The header insertion would move filtered rows outside this worksheet.");
        }
        after.set_hidden(self.hidden_set().iter().map(|hidden| hidden + u32::from(*hidden >= row)).collect());
        Ok((after != *self).then_some(after))
    }
}

impl Sheet {
    pub(super) fn shift_filter_range(&mut self, edit: ShiftEdit) {
        let Some(filter) = self.filter.as_mut() else {
            return;
        };
        let Some(mut range) = filter.range else {
            return;
        };
        let (at, count, insert, rows) = match edit {
            ShiftEdit::RowInsert { at, count } => (at, count, true, true),
            ShiftEdit::RowDelete { at, count } => (at, count, false, true),
            ShiftEdit::ColInsert { at, count } => (at, count, true, false),
            ShiftEdit::ColDelete { at, count } => (at, count, false, false),
        };
        if rows && !insert && at <= range.start.row && range.start.row < at.saturating_add(count) {
            self.filter = None;
            return;
        }
        let (start, end, limit) = if rows {
            (range.start.row, range.end.row, EXCEL_MAX_ROWS)
        } else {
            (range.start.col, range.end.col, EXCEL_MAX_COLS)
        };
        let Some((start, end)) = shift_interval(start, end, at, count, insert, limit) else {
            self.filter = None;
            return;
        };
        if rows {
            if start == end {
                self.filter = None;
                return;
            }
            range.start.row = start;
            range.end.row = end;
        } else {
            range.start.col = start;
            range.end.col = end;
            filter.rules_mut().retain_mut(|rule| {
                let col = match rule {
                    ColumnFilterRule::Equals { col_index, .. }
                    | ColumnFilterRule::Contains { col_index, .. }
                    | ColumnFilterRule::Range { col_index, .. }
                    | ColumnFilterRule::List { col_index, .. } => col_index,
                };
                let Some((next, _)) = shift_interval(*col, *col, at, count, insert, EXCEL_MAX_COLS)
                else {
                    return false;
                };
                *col = next;
                true
            });
            if filter.rules().is_empty() {
                filter.hidden_set_mut().clear();
            }
        }
        filter.range = Some(range);
        filter
            .hidden_set_mut()
            .retain(|row| *row > range.start.row && *row <= range.end.row);
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn local_filter_insert_whole_row_moves_legacy_snapshot_without_truncation() {
        let before = crate::filter::SheetAutoFilter::new(Vec::new(), [4, 8].into());
        let next = before.after_row_band_insert(5, (0, super::EXCEL_MAX_COLS - 1), 10)
            .unwrap().unwrap();
        assert_eq!(next.range(), None);
        assert_eq!(next.hidden_rows(), vec![4, 9]);
        assert!(before.after_row_band_insert(5, (0, super::EXCEL_MAX_COLS - 1), 9).is_err());
        assert_eq!(before.hidden_rows(), vec![4, 8]);
        assert!(before.after_row_band_insert(5, (0, 2), 10).unwrap().is_none());
        let invalid = crate::filter::SheetAutoFilter::new(Vec::new(), [u32::MAX].into());
        assert!(invalid.after_row_band_insert(5, (0, super::EXCEL_MAX_COLS - 1), 10).is_err());
    }
}
