//! 一次去重只产生一条原生历史；全部预检与历史预算在任何写入之前完成。
use super::*;
use crate::workbook_remove_duplicates::{RemoveDuplicatesPreview, RemoveDuplicatesRequest};

impl WorkbookHistory {
    pub fn remove_duplicates(&mut self, workbook: &mut Workbook, request: &RemoveDuplicatesRequest)
        -> Result<RemoveDuplicatesPreview, &'static str> {
        if self.pending.is_some() || workbook.is_inside_custom_call() {
            return Err("Another mutation is in progress.");
        }
        let plan = workbook.plan_remove_duplicates(request);
        workbook.store.settle_pending_reads();
        let plan = plan?;
        if plan.preview.removed_rows == 0 { return Ok(plan.preview); }
        self.begin(workbook, request.sheet, request.range, "Remove duplicates", true)?;
        let before = &self.pending.as_ref().unwrap().before[0].1;
        if before.retained_bytes().saturating_mul(2)
            .saturating_add(workbook.name(request.sheet).unwrap().len() + 256) > MAX_BYTES {
            self.pending = None;
            return Err("Removal exceeds the undo memory limit. Choose a smaller range.");
        }
        let store = workbook.store.clone();
        let mut result = Ok(());
        store.batch(|_| {
            workbook.sheet_mut(request.sheet).unwrap()
                .compact_duplicate_rows(request.range, &plan.slots, &plan.kept);
            result = self.finish(workbook, true);
        });
        result?;
        Ok(plan.preview)
    }
}
