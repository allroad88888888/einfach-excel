//! 普通格式 patch 复用共边计划，并补入正在进行的原生历史事务。
use super::*;
use crate::{sheet::border_plan_range, CellAddress, CellStyle, StyleScope};
use std::collections::HashSet;

impl WorkbookHistory {
    pub fn patch_format_range(
        &mut self,
        workbook: &mut Workbook,
        sheet: usize,
        range: CellRange,
        scope: StyleScope,
        patch: CellStyle,
    ) -> Result<usize, &'static str> {
        let range = range.normalize();
        validate_target(workbook, sheet, range)?;
        if workbook.is_inside_custom_call() {
            return Err("MUTATION_DURING_CUSTOM_CALL");
        }
        let current = workbook.sheet(sheet).unwrap();
        let mut borders = Default::default();
        let mut axis_borders = Vec::new();
        if let Some(replacement) = &patch.borders {
            let mut addresses: HashSet<CellAddress> = range.iter().collect();
            // 行列 patch 会覆盖有限展示区域之外已有的 cellStyle；这些实际地址也要同步。
            for addr in current.cell_styles.keys() {
                if match scope {
                    StyleScope::Cell => false,
                    StyleScope::Row => (range.start.row..=range.end.row).contains(&addr.row),
                    StyleScope::Column => (range.start.col..=range.end.col).contains(&addr.col),
                } {
                    addresses.insert(*addr);
                }
            }
            if scope != StyleScope::Cell && *replacement == crate::CellBorders::default() {
                axis_borders = current.plan_axis_border_clear(range, scope, &mut addresses);
            }
            borders = current.plan_replacement_borders(
                addresses
                    .into_iter()
                    .map(|addr| (addr, replacement.clone())),
                current.merged_ranges(),
            );
        }
        for (affected, _) in &axis_borders {
            self.capture_extra_formats(current, sheet, *affected);
        }
        if let Some(affected) = border_plan_range(&borders) {
            self.capture_extra_formats(current, sheet, affected);
        }
        let store = workbook.store.clone();
        let mut count = 0;
        store.batch(|_| {
            let target = workbook.sheet_mut(sheet).unwrap();
            count = target.patch_format_range(range, scope, patch);
            target.apply_axis_border_clear(scope, axis_borders);
            target.apply_border_plan(borders);
        });
        Ok(count)
    }

    /// 格式和填充共用额外样式快照，绝不把邻格值或公式纳入回放。
    pub(crate) fn capture_extra_formats(
        &mut self,
        current: &crate::Sheet,
        sheet: usize,
        range: CellRange,
    ) {
        if let Some(pending) = &mut self.pending {
            pending
                .before
                .push((sheet, HistorySnapshot::capture(current, range, false)));
        }
    }
}
