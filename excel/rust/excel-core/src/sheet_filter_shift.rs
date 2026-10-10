//! 筛选区域随行列插删位移；不重新计算匹配结果，删除表头即移除区域。
use super::*;
use crate::{shift::ShiftEdit, ColumnFilterRule};
use crate::shift::shift_interval;

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
