//! 共边会影响相邻格，只在 Rust 内计算并保存实际受影响的样式范围。
use super::*;
use crate::{
    sheet::{border_plan_ranges, BorderPreset},
    BorderSpec,
};

impl WorkbookHistory {
    pub fn patch_range_borders(
        &mut self,
        workbook: &mut Workbook,
        sheet: usize,
        range: CellRange,
        preset: BorderPreset,
        border: BorderSpec,
    ) -> Result<usize, &'static str> {
        self.patch_range_borders_sheets(workbook, sheet, &[sheet], range, preset, border)
    }

    pub fn patch_range_borders_sheets(
        &mut self,
        workbook: &mut Workbook,
        sheet: usize,
        sheets: &[usize],
        range: CellRange,
        preset: BorderPreset,
        border: BorderSpec,
    ) -> Result<usize, &'static str> {
        if self.pending.is_some() || workbook.is_inside_custom_call() {
            return Err("Another mutation is in progress.");
        }
        let range = range.normalize();
        let mut target_sheets = vec![sheet];
        for &extra in sheets {
            if !target_sheets.contains(&extra) {
                target_sheets.push(extra);
            }
        }
        let mut plans = Vec::with_capacity(target_sheets.len());
        let mut targets = Vec::new();
        for &target_sheet in &target_sheets {
            validate_target(workbook, target_sheet, range)?;
            let writes = workbook
                .sheet(target_sheet)
                .unwrap()
                .plan_range_borders(range, preset, border.clone())?;
            for addr in writes.keys() {
                workbook.ensure_range_editable(target_sheet, CellRange::single(*addr))?;
            }
            targets.extend(
                border_plan_ranges(&writes)
                    .into_iter()
                    .map(|r| (target_sheet, r, false)),
            );
            plans.push((target_sheet, writes));
        }
        if plans.iter().all(|(_, writes)| writes.is_empty()) {
            return Ok(0);
        }
        self.begin_ranges(workbook, sheet, range, "Format borders", &targets, false)?;
        let store = workbook.store.clone();
        let mut count = 0;
        let mut outcome = Ok(());
        store.batch(|_| {
            for (target_sheet, writes) in plans {
                count += workbook
                    .sheet_mut(target_sheet)
                    .unwrap()
                    .apply_border_plan(writes);
            }
            outcome = self.finish(workbook, true);
        });
        outcome?;
        Ok(count)
    }
}
