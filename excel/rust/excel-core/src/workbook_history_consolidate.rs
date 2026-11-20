//! Record a native consolidation mutation as one reversible workbook history entry.
use super::*;
use crate::consolidate::{
    ConsolidateChange, ConsolidateOverwriteApproval, ConsolidateReport, ConsolidateRequest,
};

impl WorkbookHistory {
    pub fn consolidate(
        &mut self,
        workbook: &mut Workbook,
        request: &ConsolidateRequest,
        approval: Option<ConsolidateOverwriteApproval>,
    ) -> Result<ConsolidateReport, &'static str> {
        if self.pending.is_some() || workbook.is_inside_custom_call() {
            return Err("Another history command is pending.");
        }
        let (change, report) = ConsolidateChange::execute(workbook, request, approval)?;
        if report.changed_cells > 0 || report.linked_groups > 0 {
            let sheet = request.sheet;
            let sheet_key = workbook.sheet_key(sheet).unwrap();
            let sheet_name = workbook.name(sheet).unwrap().to_owned();
            self.push(HistoryEntry {
                label: "Consolidate".to_owned(),
                sheet,
                range: report.target,
                sheet_key,
                sheet_name,
                affected_indices: vec![sheet],
                affected_keys: vec![sheet_key],
                origin: Rc::downgrade(&workbook.atom_context),
                change: HistoryChange::Consolidate(Box::new(change)),
            });
        }
        Ok(report)
    }
}
