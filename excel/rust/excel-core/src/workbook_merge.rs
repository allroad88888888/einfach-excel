//! 合并单元格的原生预检与写入；确认前不清除内容，不改变样式。
use super::*;
use crate::{Align, CellStyle, StyleScope};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MergeAction {
    Merge,
    Center,
    Unmerge,
}

impl Workbook {
    pub(crate) fn validate_merge(
        &self,
        sheet: usize,
        range: CellRange,
        action: MergeAction,
        discard: bool,
    ) -> Result<(), &'static str> {
        if self.is_inside_custom_call() {
            return Err("MUTATION_DURING_CUSTOM_CALL");
        }
        let target = self.sheet(sheet).ok_or("The worksheet no longer exists.")?;
        if range.start.row > range.end.row
            || range.start.col > range.end.col
            || range.end.row >= crate::sheet::EXCEL_MAX_ROWS
            || range.end.col >= crate::sheet::EXCEL_MAX_COLS
        {
            return Err("Invalid merge range.");
        }
        if action == MergeAction::Unmerge {
            return Ok(());
        }
        target.validate_merge_range(range)?;
        if self.tables.values().any(|table| {
            Some(table.sheet_name.as_str()) == self.name(sheet) && table.range.intersects(range)
        }) {
            return Err("Unmerge or move the cells outside the Excel Table first.");
        }
        let mut occupied = false;
        let mut spill = false;
        target.for_each_non_empty_in_range(range, |addr| {
            occupied |= addr != range.start;
            spill |= target.is_spill_region(addr);
        });
        if spill {
            return Err("Cannot merge cells in an array spill.");
        }
        if occupied && !discard {
            return Err("MERGE_CONTENT_CONFIRMATION_REQUIRED");
        }
        Ok(())
    }

    /// 仅保留左上角原始内容；确认标志由调用者明确给出，取消合并不恢复已删除内容。
    pub fn merge_cells(
        &mut self,
        sheet: usize,
        range: CellRange,
        action: MergeAction,
        discard: bool,
    ) -> Result<bool, &'static str> {
        self.validate_merge(sheet, range, action, discard)?;
        let existing = self.sheets[sheet].merges_in_range(range);
        let next = if action != MergeAction::Unmerge && range.start != range.end {
            vec![range]
        } else {
            Vec::new()
        };
        let mut clear = Vec::new();
        if action != MergeAction::Unmerge {
            self.sheets[sheet].for_each_non_empty_in_range(range, |addr| {
                if addr != range.start {
                    clear.push(addr);
                }
            });
        }
        let center = action == MergeAction::Center
            && self.sheets[sheet]
                .get_format(&range.start.to_string())
                .align
                != Align::Center;
        if existing == next && clear.is_empty() && !center {
            return Ok(false);
        }
        let observers = self.sheets[sheet].suspend_structure_notifications();
        let store = self.store.clone();
        store.batch(|_| {
            for addr in clear {
                self.clear_cell(sheet, &addr.to_string());
            }
            self.sheets[sheet].replace_merges_in_range(range, &next);
            if center {
                self.sheets[sheet].patch_format_range(
                    CellRange::single(range.start),
                    StyleScope::Cell,
                    CellStyle {
                        align: Some(Align::Center),
                        ..Default::default()
                    },
                );
            }
            if action == MergeAction::Unmerge {
                let anchors = self.sheets[sheet].teardown_blocked_spill_anchors();
                self.sheets[sheet].project_bulk_spill_anchors(anchors);
            }
        });
        self.sheets[sheet].resume_structure_notifications(observers);
        Ok(true)
    }
}
