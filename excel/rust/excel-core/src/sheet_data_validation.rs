//! Sheet 的稀疏验证区域；覆盖/清除只改矩形边界，不扫描范围内的单元格。
use super::*;
use crate::data_validation::{DataValidationRegion, DataValidationRule, MAX_VALIDATION_REGIONS};
use crate::shift::{shift_interval, ShiftEdit};

impl Sheet {
    pub fn data_validations(&self) -> &[DataValidationRegion] {
        &self.data_validations
    }

    pub fn data_validation_at(&self, address: CellAddress) -> Option<&DataValidationRule> {
        self.data_validations
            .iter()
            .find(|entry| entry.range.contains(address))
            .map(|entry| entry.rule.as_ref())
    }

    /// None 清除选区规则；重叠部分被替换，原区域的其它格子保留原规则。
    /// 先完成配置/容量预检，失败不改变现有目录。
    pub fn set_data_validation(
        &mut self,
        range: CellRange,
        rule: Option<DataValidationRule>,
    ) -> Result<(), &'static str> {
        if self
            .workbook_context
            .borrow()
            .as_ref()
            .and_then(Weak::upgrade)
            .is_some_and(|context| context.custom_call_depth.get() > 0)
        {
            return Err("MUTATION_DURING_CUSTOM_CALL");
        }
        if range.start.row > range.end.row
            || range.start.col > range.end.col
            || range.end.row >= EXCEL_MAX_ROWS
            || range.end.col >= EXCEL_MAX_COLS
        {
            return Err("Invalid data-validation range.");
        }
        if let Some(rule) = &rule {
            rule.validate_definition()?;
        }
        // 重复应用同一规则没有用户可见变化，也不能把同一大区域越拆越碎。
        if self.data_validations.iter().any(|entry| {
            Some(entry.rule.as_ref()) == rule.as_ref()
                && entry.range.contains(range.start)
                && entry.range.contains(range.end)
        }) {
            return Ok(());
        }
        let mut next = Vec::new();
        for entry in &self.data_validations {
            for remainder in subtract(entry.range, range) {
                next.push(DataValidationRegion {
                    range: remainder,
                    rule: Arc::clone(&entry.rule),
                });
            }
        }
        if let Some(rule) = rule {
            next.push(DataValidationRegion {
                range,
                rule: Arc::new(rule),
            });
        }
        if next.len() > MAX_VALIDATION_REGIONS {
            return Err("Too many data-validation regions.");
        }
        self.data_validations = next;
        Ok(())
    }

    pub(super) fn shift_data_validations(&mut self, edit: ShiftEdit) {
        self.data_validations.retain_mut(|entry| {
            let (start, end, limit) = if edit.is_row_edit() {
                (
                    &mut entry.range.start.row,
                    &mut entry.range.end.row,
                    EXCEL_MAX_ROWS,
                )
            } else {
                (
                    &mut entry.range.start.col,
                    &mut entry.range.end.col,
                    EXCEL_MAX_COLS,
                )
            };
            let (at, count, insert) = match edit {
                ShiftEdit::RowInsert { at, count } | ShiftEdit::ColInsert { at, count } => {
                    (at, count, true)
                }
                ShiftEdit::RowDelete { at, count } | ShiftEdit::ColDelete { at, count } => {
                    (at, count, false)
                }
            };
            // 整行/整列验证固定在表格边界；普通有限范围随内容位移。
            if *start == 0 && *end == limit - 1 {
                return true;
            }
            if let Some((lo, hi)) = shift_interval(*start, *end, at, count, insert, limit) {
                *start = lo;
                *end = hi;
                true
            } else {
                false
            }
        });
    }
}

/// 矩形差集最多四块，互不重叠；不遍历哪怕一个空白 cell。
fn subtract(source: CellRange, cut: CellRange) -> Vec<CellRange> {
    if !source.intersects(cut) {
        return vec![source];
    }
    let top = source.start.row.max(cut.start.row);
    let bottom = source.end.row.min(cut.end.row);
    let left = source.start.col.max(cut.start.col);
    let right = source.end.col.min(cut.end.col);
    let mut result = Vec::with_capacity(4);
    let mut add = |r0, c0, r1, c1| {
        result.push(CellRange::new(
            CellAddress::new(r0, c0),
            CellAddress::new(r1, c1),
        ))
    };
    if source.start.row < top {
        add(source.start.row, source.start.col, top - 1, source.end.col);
    }
    if bottom < source.end.row {
        add(bottom + 1, source.start.col, source.end.row, source.end.col);
    }
    if source.start.col < left {
        add(top, source.start.col, bottom, left - 1);
    }
    if right < source.end.col {
        add(top, right + 1, bottom, source.end.col);
    }
    result
}
