//! Included as a child of workbook_history to inspect exact native history targets.
use super::*;

impl HistoryEntry {
    pub(super) fn ensure_current_protection(
        &self,
        workbook: &Workbook,
        undo: bool,
    ) -> Result<(), &'static str> {
        match &self.change {
            HistoryChange::Cells {
                before,
                after,
                table_rows,
                dimensions,
            } => {
                for (sheet, snapshot) in before.iter().chain(after) {
                    workbook.ensure_range_editable(*sheet, snapshot.range)?;
                }
                dimensions.validate(workbook, undo)?;
                if !table_rows.is_empty() {
                    // Activating/deactivating an insert row changes the shared Table definition.
                    workbook.ensure_workbook_unprotected()?;
                }
                Ok(())
            }
            HistoryChange::Sheet(_)
            | HistoryChange::NamedRange(_)
            | HistoryChange::CustomFormula(_)
            | HistoryChange::Structure(_)
            | HistoryChange::TableDefinition(_)
            | HistoryChange::TableCreate(_) => workbook.ensure_workbook_unprotected(),
            _ => workbook.ensure_sheet_unprotected(self.sheet),
        }
    }
}
