//! Table 局部插行的条件规则位移；范围与公式保存在同一条规则历史中。
use super::*;
use crate::shift::{rewrite_row_band_insert, insert_row_band_range};

impl FormulaRuleChange {
    pub fn prepare_row_band_insert(
        workbook: &Workbook, sheet: usize, row: u32, columns: (u32, u32), row_count: u32,
    ) -> Result<Vec<Self>, &'static str> {
        // 包括其它工作表的公式消费者；保留未实现的旧规则原文。
        let mut changes = Self::prepare(workbook, &|owner, _, expr|
            rewrite_row_band_insert(expr, &workbook.names[sheet], owner == sheet, row, columns));
        let key = workbook.sheet_keys[sheet];
        for before in &workbook.conditional_formats[sheet].rules {
            let mut ranges = Vec::new();
            for area in before.ranges() {
                ranges.extend(insert_row_band_range(area, row, columns, row_count)
                    .map_err(|_| "The header insertion would move conditional formatting outside this worksheet.")?);
            }
            if before.ranges().eq(ranges.iter().copied()) { continue; }
            let change = if let Some(index) = changes.iter().position(|change| change.sheet_key == key) {
                &mut changes[index]
            } else {
                changes.push(Self { sheet_key: key, entries: Vec::new() });
                changes.last_mut().unwrap()
            };
            let after = if let Some(index) = change.entries.iter().position(|(old, _)| old.id == before.id) {
                &mut change.entries[index].1
            } else {
                change.entries.push((before.clone(), before.clone()));
                &mut change.entries.last_mut().unwrap().1
            };
            after.set_ranges(ranges);
            if !after.valid_ranges() {
                return Err("The header insertion exceeds the conditional-format region limit.");
            }
        }
        Ok(changes)
    }
}
