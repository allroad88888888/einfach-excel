//! 工作表大纲随插删行列移动，数据仍归原 Sheet 所有。
use super::*;
use crate::outline::{OutlineAxis, SheetOutline};
use crate::shift::{shift_interval, ShiftEdit};

impl crate::Workbook {
    /// 导入/历史的替换入口。折叠影响 SUBTOTAL 101–111，但不改变手动隐藏集合。
    pub fn set_outline(&mut self, sheet_index: usize, outline: SheetOutline) -> Result<bool, &'static str> {
        if self.is_inside_custom_call() {
            return Err("Cannot change outline during a custom call.");
        }
        outline.validate()?;
        let sheet = self.sheet_mut(sheet_index).ok_or("The worksheet no longer exists.")?;
        if sheet.outline == outline {
            return Ok(false);
        }
        sheet.outline = outline;
        self.republish_hidden(sheet_index);
        Ok(true)
    }
}

impl Sheet {
    pub fn outline(&self) -> &SheetOutline {
        &self.outline
    }

    pub(super) fn shift_outline(&mut self, edit: ShiftEdit) {
        let (at, count, insert) = match edit {
            ShiftEdit::RowInsert { at, count } | ShiftEdit::ColInsert { at, count } => {
                (at, count, true)
            }
            ShiftEdit::RowDelete { at, count } | ShiftEdit::ColDelete { at, count } => {
                (at, count, false)
            }
        };
        let axis = if edit.is_row_edit() {
            OutlineAxis::Row
        } else {
            OutlineAxis::Column
        };
        self.outline.groups_mut(axis).retain_mut(|group| {
            if let Some((start, end)) =
                shift_interval(group.start, group.end, at, count, insert, axis.limit())
            {
                group.start = start;
                group.end = end;
                true
            } else {
                false
            }
        });
    }
}
