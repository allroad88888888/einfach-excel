//! 结构命令先验证整个移动，再进入已有原生位移事务；拒绝时不改变任何表。
use super::*;
use crate::shift::ShiftEdit;

impl Workbook {
    /// 可报告失败的行列结构入口。零数量是无操作；旧四个 void API 也使用同一预检。
    pub fn try_structural_edit(
        &mut self,
        sheet_index: usize,
        edit: ShiftEdit,
    ) -> Result<(), &'static str> {
        self.validate_structural_edit(sheet_index, edit)?;
        let count = match edit {
            ShiftEdit::RowInsert { count, .. }
            | ShiftEdit::RowDelete { count, .. }
            | ShiftEdit::ColInsert { count, .. }
            | ShiftEdit::ColDelete { count, .. } => count,
        };
        if count != 0 {
            self.apply_structural_shift_with_table_follow(sheet_index, edit);
        }
        Ok(())
    }

    pub(crate) fn validate_structural_edit(
        &self,
        sheet_index: usize,
        edit: ShiftEdit,
    ) -> Result<(), &'static str> {
        if self.is_inside_custom_call() {
            return Err("Cannot edit worksheet structure during a custom call.");
        }
        let sheet = self
            .sheet(sheet_index)
            .ok_or("The worksheet no longer exists.")?;
        sheet.validate_structural_edit(edit)?;
        let (count, limit) = match edit {
            ShiftEdit::RowInsert { count, .. } => (count, crate::sheet::EXCEL_MAX_ROWS),
            ShiftEdit::ColInsert { count, .. } => (count, crate::sheet::EXCEL_MAX_COLS),
            _ => return Ok(()),
        };
        if count == 0 {
            return Ok(());
        }
        // 空表格对象仍有几何，不能仅凭“末尾没有值”就把 Table 推出工作表。
        let name = self.name(sheet_index).unwrap();
        if self.tables.values().any(|table| {
            table.sheet_name == name
                && if edit.is_row_edit() {
                    table.range.end.row >= limit - count
                } else {
                    table.range.end.col >= limit - count
                }
        }) {
            return Err("The insertion would move a table outside the worksheet.");
        }
        Ok(())
    }
}
