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
                // Activating/deactivating an insert row changes the Table on its own worksheet.
                workbook.ensure_tables_unprotected(table_rows)?;
                Ok(())
            }
            // Worksheet protection governs cell edits, not sheet structure or tab metadata.
            // Topology replay updates references internally and retains protection by stable key.
            HistoryChange::Sheet(_) | HistoryChange::SheetTab(_) => Ok(()),
            // Row/column and cell shifts lock only the edited sheet: elsewhere, replay restores
            // just the rewritten formula and rule sources, like the forward edit.
            HistoryChange::Structure(_) | HistoryChange::CellShift(_) =>
                workbook.ensure_sheet_unprotected(self.sheet),
            // Table definitions lock only their own sheet; structured references follow.
            HistoryChange::TableDefinition(_) | HistoryChange::TableCreate(_) =>
                workbook.ensure_sheet_unprotected(self.sheet),
            // Names and custom formulas are workbook metadata, as in Excel; recalculating locked
            // formulas is not an edit. Interfaces still refuse them from a protected active sheet.
            HistoryChange::NamedRange(_) | HistoryChange::CustomFormula(_) => Ok(()),
            _ => workbook.ensure_sheet_unprotected(self.sheet),
        }
    }
}
