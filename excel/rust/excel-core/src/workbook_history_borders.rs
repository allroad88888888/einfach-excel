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
        if self.pending.is_some() || workbook.is_inside_custom_call() {
            return Err("Another mutation is in progress.");
        }
        let range = range.normalize();
        validate_target(workbook, sheet, range)?;
        let writes = workbook
            .sheet(sheet)
            .unwrap()
            .plan_range_borders(range, preset, border)?;
        if writes.is_empty() {
            return Ok(0);
        }
        let targets: Vec<_> = border_plan_ranges(&writes)
            .into_iter()
            .map(|range| (sheet, range, false))
            .collect();
        for addr in writes.keys() {
            workbook.ensure_range_editable(sheet, CellRange::single(*addr))?;
        }
        self.begin_ranges(workbook, sheet, range, "Format borders", &targets, false)?;
        let store = workbook.store.clone();
        let mut count = 0;
        let mut outcome = Ok(());
        store.batch(|_| {
            count = workbook.sheet_mut(sheet).unwrap().apply_border_plan(writes);
            outcome = self.finish(workbook, true);
        });
        outcome?;
        Ok(count)
    }
}
