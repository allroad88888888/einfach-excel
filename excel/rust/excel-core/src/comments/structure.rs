//! 整行列结构命令移动稀疏线程坐标；删除带内线程随格子进入历史快照。
use crate::{Sheet, shift::ShiftEdit};

impl Sheet {
    pub(crate) fn validate_comment_shift(&self, edit: ShiftEdit) -> Result<(), &'static str> {
        let (at, count, limit, row) = match edit {
            ShiftEdit::RowInsert { at, count } => (at, count, crate::sheet::EXCEL_MAX_ROWS, true),
            ShiftEdit::ColInsert { at, count } => (at, count, crate::sheet::EXCEL_MAX_COLS, false),
            _ => return Ok(()),
        };
        if count > limit || self.comments.keys().any(|addr| {
            let axis = if row { addr.row } else { addr.col };
            axis >= at && axis >= limit - count
        }) { return Err("The insertion would move a comment outside the worksheet."); }
        Ok(())
    }

    pub(crate) fn shift_comments(&mut self, edit: ShiftEdit) {
        self.comments = std::mem::take(&mut self.comments).into_iter().filter_map(|(addr, thread)| {
            let next = edit.apply(addr);
            (next.row < crate::sheet::EXCEL_MAX_ROWS && next.col < crate::sheet::EXCEL_MAX_COLS)
                .then_some((next, thread))
        }).collect();
    }
}
