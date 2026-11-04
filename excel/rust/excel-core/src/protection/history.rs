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
            // Worksheet protection governs cell edits, not sheet structure or tab metadata.
            // Topology replay updates references internally and retains protection by stable key.
            HistoryChange::Sheet(_) | HistoryChange::SheetTab(_) => Ok(()),
            // The forward edit only rewrites references elsewhere, but replay restores whole
            // snapshots (formats, notes, widths, rule catalogs) on every affected sheet, so a
            // protected referencing sheet must be unprotected before undo/redo.
            HistoryChange::Structure(_) | HistoryChange::CellShift(_) => std::iter::once(self.sheet)
                .chain(self.affected_indices.iter().copied())
                .try_for_each(|sheet| workbook.ensure_sheet_unprotected(sheet)),
            HistoryChange::NamedRange(_)
            | HistoryChange::CustomFormula(_)
            | HistoryChange::TableDefinition(_)
            | HistoryChange::TableCreate(_) => workbook.ensure_workbook_unprotected(),
            _ => workbook.ensure_sheet_unprotected(self.sheet),
        }
    }
}
