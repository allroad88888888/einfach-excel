//! 条件格式范围随行列插删位移；仅改规则几何，不枚举规则覆盖的单元格。
use super::*;
use crate::sheet::{EXCEL_MAX_COLS, EXCEL_MAX_ROWS};
use crate::shift::{shift_interval, ShiftEdit};

impl Workbook {
    pub(super) fn shifted_conditional_format_rules(
        &self,
        sheet: usize,
        edit: ShiftEdit,
    ) -> Vec<ConditionalFormatRuleEntry> {
        let (at, count, insert) = match edit {
            ShiftEdit::RowInsert { at, count } | ShiftEdit::ColInsert { at, count } => {
                (at, count, true)
            }
            ShiftEdit::RowDelete { at, count } | ShiftEdit::ColDelete { at, count } => {
                (at, count, false)
            }
        };
        self.conditional_formats[sheet]
            .rules
            .iter()
            .filter_map(|entry| {
                let mut next = entry.clone();
                let (lo, hi, limit) = if edit.is_row_edit() {
                    (&mut next.row_start, &mut next.row_end, EXCEL_MAX_ROWS)
                } else {
                    (&mut next.col_start, &mut next.col_end, EXCEL_MAX_COLS)
                };
                (*lo, *hi) = shift_interval(*lo, *hi, at, count, insert, limit)?;
                Some(next)
            })
            .collect()
    }

    /// 必须在结构写入之前检查，修订号耗尽不能留下只移动了单元格的半次操作。
    pub(super) fn validate_conditional_format_shift(
        &self,
        sheet: usize,
        edit: ShiftEdit,
    ) -> Result<(), &'static str> {
        let config = &self.conditional_formats[sheet];
        if config.revision == u64::MAX
            && config.rules != self.shifted_conditional_format_rules(sheet, edit)
        {
            return Err("Conditional-format revision is exhausted.");
        }
        Ok(())
    }
}
