//! Record a successful subtotal calculation as one workbook history entry.
use super::*;
use crate::subtotal::{SubtotalChange, SubtotalReport, SubtotalRequest};

impl WorkbookHistory {
    pub fn change_subtotals(
        &mut self,
        workbook: &mut Workbook,
        request: &SubtotalRequest,
    ) -> Result<Option<SubtotalReport>, &'static str> {
        if self.pending.is_some() || workbook.is_inside_custom_call() {
            return Err("Another history command is pending.");
        }
        let Some((change, report)) = SubtotalChange::execute(workbook, request)? else {
            return Ok(None);
        };
        let sheet = request.sheet;
        let affected_indices: Vec<_> = change.affected_sheets().into_iter().collect();
        let label = if matches!(request.action, crate::subtotal::SubtotalAction::Remove) {
            "Remove subtotals"
        } else {
            "Subtotal"
        };
        self.push(HistoryEntry {
            label: label.to_owned(),
            sheet,
            range: report.range,
            sheet_key: workbook.sheet_key(sheet).unwrap(),
            sheet_name: workbook.name(sheet).unwrap().to_owned(),
            affected_keys: affected_indices
                .iter()
                .map(|&index| workbook.sheet_key(index).unwrap())
                .collect(),
            affected_indices,
            origin: Rc::downgrade(&workbook.atom_context),
            change: HistoryChange::Subtotal(Box::new(change)),
        });
        Ok(Some(report))
    }
}
