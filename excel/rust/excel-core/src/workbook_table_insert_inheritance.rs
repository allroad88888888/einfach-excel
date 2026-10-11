//! 结构插行只为扩进 Table 数据区的新空行生成标准公式，不复制已有数据行。
use super::*;
use crate::shift::ShiftEdit;
use crate::workbook_history::MAX_BYTES;
use crate::CellSnapshot;

impl Workbook {
    /// 旧公式下移后也可能转入数组分支；只查实际 spill 索引，不求值整列。
    pub(super) fn validate_inserted_table_arrays(&self, sheet: usize, edit: ShiftEdit)
        -> Result<(), &'static str> {
        let ShiftEdit::RowInsert { at, count } = edit else { return Ok(()); };
        let target = &self.sheets[sheet];
        let blocked = target.blocked_anchor_addresses();
        for table in self.tables.values().filter(|table| {
            Some(table.sheet_name()) == self.name(sheet)
                && at > table.range.start.row && at + count <= table.range.end.row
                && table.calculated_columns.iter().any(Option::is_some)
        }) {
            if target.spill_intersecting(table.range).is_some()
                || blocked.iter().any(|anchor| table.range.contains(*anchor)) {
                return Err("Spilled arrays cannot be entered inside a table.");
            }
        }
        Ok(())
    }

    pub(super) fn has_table_row_inheritance(&self, sheet: usize, edit: ShiftEdit) -> bool {
        let ShiftEdit::RowInsert { at, count } = edit else { return false; };
        count != 0 && self.tables.values().any(|table| {
            Some(table.sheet_name()) == self.name(sheet)
                && at > table.range.start.row && at <= table.range.end.row
                && table.calculated_columns.iter().any(Option::is_some)
        })
    }

    /// 位移前预检预算，模板沿用真实结构改写器；不先改工作表再尝试分配百万条。
    pub(super) fn inserted_table_formulas(&self, sheet: usize, edit: ShiftEdit)
        -> Result<Vec<CellSnapshot>, &'static str> {
        if !self.has_table_row_inheritance(sheet, edit) { return Ok(Vec::new()); }
        let ShiftEdit::RowInsert { at, count } = edit else { unreachable!(); };
        let mut result = Vec::new();
        let mut bytes = 0;
        for table in self.tables.values().filter(|table| {
            Some(table.sheet_name()) == self.name(sheet)
                && at > table.range.start.row && at <= table.range.end.row
        }) {
            let mut range = table.range;
            range.end.row += count; // 调用者已经做过结构越界预检。
            let columns = super::workbook_table_shift::shifted_columns(table, range, edit);
            bytes += count as usize * columns.iter().filter(|formula| formula.is_some()).count() * 96;
            if bytes > MAX_BYTES { return Err("Table row inheritance exceeds the 32 MiB undo budget."); }
            for row in at..at + count {
                for (offset, formula) in columns.iter().enumerate() {
                    let Some(formula) = formula else { continue; };
                    let source = formula.formula_at(row)?;
                    bytes += source.len();
                    if bytes > MAX_BYTES { return Err("Table row inheritance exceeds the 32 MiB undo budget."); }
                    result.push(CellSnapshot::formula(
                        CellAddress::new(row, range.start.col + offset as u32), source));
                }
            }
        }
        result.sort_by_key(|cell| (cell.addr.row, cell.addr.col));
        Ok(result)
    }
}
