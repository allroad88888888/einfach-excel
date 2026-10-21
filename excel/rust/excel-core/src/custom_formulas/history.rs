//! Included as a workbook_history child; one definition action is one history entry.
use super::*;
use crate::custom_formulas::{CustomFormulaAction, CustomFormulaChange};

impl WorkbookHistory {
    pub fn change_custom_formula(
        &mut self,
        workbook: &mut Workbook,
        active_sheet: usize,
        action: CustomFormulaAction,
    ) -> Result<bool, &'static str> {
        if self.pending.is_some() || workbook.is_inside_custom_call() {
            return Err("Another history command is pending.");
        }
        workbook.ensure_workbook_unprotected()?;
        let sheet_key = workbook
            .sheet_key(active_sheet)
            .ok_or("The worksheet no longer exists.")?;
        let Some(change) = CustomFormulaChange::prepare(workbook, action)? else {
            return Ok(false);
        };
        let affected_indices: Vec<_> = (0..workbook.sheet_count()).collect();
        let label = change.label().into();
        change.apply(workbook, false)?;
        self.push(HistoryEntry {
            label,
            sheet: active_sheet,
            range: CellRange::single(crate::CellAddress::new(0, 0)),
            sheet_key,
            sheet_name: workbook.name(active_sheet).unwrap().into(),
            affected_keys: affected_indices
                .iter()
                .map(|index| workbook.sheet_key(*index).unwrap())
                .collect(),
            affected_indices,
            origin: Rc::downgrade(&workbook.atom_context),
            change: HistoryChange::CustomFormula(Box::new(change)),
        });
        Ok(true)
    }
}
