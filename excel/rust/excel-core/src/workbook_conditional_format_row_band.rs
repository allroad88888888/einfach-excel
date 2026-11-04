//! 局部带内位移（Table 插行、插入/删除单元格）的条件规则变化；范围与公式保存在同一条规则历史中。
use super::*;
use crate::shift::{
    band_shift_range, insert_row_band_range, rewrite_band_shift, rewrite_row_band_insert,
    ShiftEdit,
};

impl FormulaRuleChange {
    pub fn prepare_row_band_insert(
        workbook: &Workbook, sheet: usize, row: u32, columns: (u32, u32), row_count: u32,
    ) -> Result<Vec<Self>, &'static str> {
        Self::prepare_band(
            workbook,
            sheet,
            &|owner, expr| {
                rewrite_row_band_insert(expr, &workbook.names[sheet], owner == sheet, row, columns)
            },
            &|area| {
                insert_row_band_range(area, row, columns, row_count).map_err(|_| {
                    "The header insertion would move conditional formatting outside this worksheet."
                })
            },
            "The header insertion exceeds the conditional-format region limit.",
        )
    }

    /// 插入/删除单元格：区域按单元格位移，规则公式按带内引用规则改写。
    pub fn prepare_cell_shift(
        workbook: &Workbook, sheet: usize, edit: ShiftEdit, band: (u32, u32),
    ) -> Result<Vec<Self>, &'static str> {
        Self::prepare_band(
            workbook,
            sheet,
            &|owner, expr| rewrite_band_shift(expr, &workbook.names[sheet], owner == sheet, edit, band),
            &|area| Ok(band_shift_range(area, edit, band)),
            "Shifting these cells would remove or split conditional formatting beyond its limits.",
        )
    }

    fn prepare_band(
        workbook: &Workbook,
        sheet: usize,
        rewrite: &impl Fn(usize, &mut Expr) -> bool,
        map: &impl Fn(CellRange) -> Result<Vec<CellRange>, &'static str>,
        limit_error: &'static str,
    ) -> Result<Vec<Self>, &'static str> {
        // 包括其它工作表的公式消费者；保留未实现的旧规则原文。本表的验证规则随区域位移由调用者改写。
        let mut changes = Self::prepare_except(workbook, &|owner, _, expr| rewrite(owner, expr), Some(sheet));
        let key = workbook.sheet_keys[sheet];
        for before in &workbook.conditional_formats[sheet].rules {
            let mut ranges = Vec::new();
            for area in before.ranges() {
                ranges.extend(map(area)?);
            }
            if before.ranges().eq(ranges.iter().copied()) { continue; }
            let change = if let Some(index) = changes.iter().position(|change| change.sheet_key == key) {
                &mut changes[index]
            } else {
                changes.push(Self { sheet_key: key, entries: Vec::new(), validations: Vec::new() });
                changes.last_mut().unwrap()
            };
            let after = if let Some(index) = change.entries.iter().position(|(old, _)| old.id == before.id) {
                &mut change.entries[index].1
            } else {
                change.entries.push((before.clone(), before.clone()));
                &mut change.entries.last_mut().unwrap().1
            };
            if ranges.is_empty() { return Err(limit_error); }
            after.set_ranges(ranges);
            if !after.valid_ranges() {
                return Err(limit_error);
            }
        }
        Ok(changes)
    }
}
