//! 命名区域随行列结构变化；历史仅记录实际变化的名称坐标。

use super::*;
use crate::shift::{shift_structural_range, ShiftEdit};

#[derive(Debug)]
pub(super) struct NamedRangeShift {
    name: String,
    before: Option<CellRange>,
    after: Option<CellRange>,
}

impl NamedRangeShift {
    pub(super) fn retained_bytes(&self) -> usize {
        self.name.len() + std::mem::size_of::<Self>()
    }
}

impl Workbook {
    pub(super) fn shifted_named_ranges(
        &self,
        sheet: usize,
        edit: ShiftEdit,
    ) -> Vec<NamedRangeShift> {
        let Some(key) = self.sheet_key(sheet) else {
            return Vec::new();
        };
        self.named_values
            .iter()
            .filter_map(|(name, entry)| {
                let NamedDefinition::Range {
                    sheet_key,
                    range: Some(before),
                } = entry.definition
                else {
                    return None;
                };
                if sheet_key != key {
                    return None;
                }
                // 整行/整列的完整轴不因该轴插删而变短，语义与 A:A / 1:1 一致。
                let bounds = match (
                    before.start.row == 0 && before.end.row == GRID_MAX_ROW,
                    before.start.col == 0 && before.end.col == GRID_MAX_COL,
                ) {
                    (true, true) => RangeBounds::Both,
                    (true, false) => RangeBounds::Rows,
                    (false, true) => RangeBounds::Cols,
                    _ => RangeBounds::None,
                };
                let mut after = before;
                let valid = shift_structural_range(&mut after.start, &mut after.end, bounds, edit);
                let after = valid.then_some(after);
                (after != Some(before)).then(|| NamedRangeShift {
                    name: name.clone(),
                    before: Some(before),
                    after,
                })
            })
            .collect()
    }

    pub(super) fn validate_named_range_shift(
        &self,
        sheet: usize,
        edit: ShiftEdit,
    ) -> Result<(), &'static str> {
        if matches!(
            edit,
            ShiftEdit::RowInsert { .. } | ShiftEdit::ColInsert { .. }
        ) && self
            .shifted_named_ranges(sheet, edit)
            .iter()
            .any(|change| change.after.is_none())
        {
            return Err("The insertion would move a named range outside the worksheet.");
        }
        Ok(())
    }

    pub(super) fn validate_named_range_restore(
        &self,
        sheet: usize,
        changes: &[NamedRangeShift],
        undo: bool,
    ) -> Result<(), &'static str> {
        let key = self
            .sheet_key(sheet)
            .ok_or("The worksheet no longer exists.")?;
        for change in changes {
            let expected = if undo { change.after } else { change.before };
            if !matches!(self.named_values.get(&change.name),
                Some(NamedEntry { definition: NamedDefinition::Range { sheet_key, range }, .. })
                    if *sheet_key == key && *range == expected)
            {
                return Err("A named range changed outside history.");
            }
        }
        Ok(())
    }

    /// 调用方在写入前验证身份；恢复坐标后仅发布一次现有名称 epoch。
    pub(super) fn restore_named_range_coordinates(
        &mut self,
        changes: &[NamedRangeShift],
        undo: bool,
    ) {
        if changes.is_empty() {
            return;
        }
        for change in changes {
            let entry = self
                .named_values
                .get_mut(&change.name)
                .expect("validated named range");
            let NamedDefinition::Range { range, .. } = &mut entry.definition else {
                unreachable!("validated named range")
            };
            *range = if undo { change.before } else { change.after };
        }
        self.sync_atom_names();
    }
}
