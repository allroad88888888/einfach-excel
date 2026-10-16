//! 普通格式 patch 复用共边计划，并补入正在进行的原生历史事务。
use super::*;
use crate::{sheet::border_plan_range, CellAddress, CellStyle, StyleScope};
use std::collections::HashSet;

impl WorkbookHistory {
    /// 所有区域共用一份属性 patch；全体预检后才写入，并且只生成一条历史。
    pub fn patch_format_selection(
        &mut self,
        workbook: &mut Workbook,
        sheet: usize,
        targets: &[(CellRange, StyleScope)],
        patch: CellStyle,
    ) -> Result<CellRange, &'static str> {
        if self.pending.is_some() || workbook.is_inside_custom_call() {
            return Err("Another mutation is in progress.");
        }
        if targets.is_empty() || targets.len() > 500 {
            return Err("Format selection requires between 1 and 500 areas.");
        }
        let mut affected = targets[0].0;
        let mut visits = 0_u64;
        let mut snapshots = Vec::with_capacity(targets.len());
        for &(range, scope) in targets {
            validate_target(workbook, sheet, range)?;
            let source = workbook.sheet(sheet).unwrap();
            // 行列样式只作用于指定轴；穿过合并框不应扩大或拒绝整行／整列操作。
            if scope == StyleScope::Cell && source.merged_ranges().iter().any(|merged| merged.intersects(range)
                && (!range.contains(merged.start) || !range.contains(merged.end))) {
                return Err("Select the entire merged cell before formatting.");
            }
            visits += u64::from(range.rows()) * u64::from(range.cols());
            if visits > 100_000 {
                return Err("Formatting exceeds 100,000 addressed cells. Choose a smaller selection.");
            }
            affected.start.row = affected.start.row.min(range.start.row);
            affected.start.col = affected.start.col.min(range.start.col);
            affected.end.row = affected.end.row.max(range.end.row);
            affected.end.col = affected.end.col.max(range.end.col);
            // rowStyle / columnStyle 的交叉覆盖可超出可见画布；历史只捕获格式，不能回放值。
            let history_range = match scope {
                StyleScope::Cell => range,
                StyleScope::Row => CellRange::new(CellAddress::new(range.start.row, 0),
                    CellAddress::new(range.end.row, 16_383)),
                StyleScope::Column => CellRange::new(CellAddress::new(0, range.start.col),
                    CellAddress::new(1_048_575, range.end.col)),
            };
            snapshots.push((sheet, history_range, false));
        }
        self.begin_ranges(workbook, sheet, affected, "Format selection", &snapshots, false)?;
        let store = workbook.store.clone();
        let mut outcome = Ok(());
        store.batch(|_| {
            outcome = targets.iter().try_for_each(|&(range, scope)| {
                self.patch_format_range(workbook, sheet, range, scope, patch.clone()).map(|_| ())
            });
            if let Err(error) = self.finish(workbook, outcome.is_ok()) { outcome = Err(error); }
        });
        outcome?;
        Ok(affected)
    }

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
