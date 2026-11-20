//! Included as a child of workbook_history to inspect exact native history targets.
use super::*;

impl HistoryEntry {
    pub(super) fn ensure_current_protection(
        &self,
        workbook: &Workbook,
        undo: bool,
    ) -> Result<(), &'static str> {
        match &self.change {
            // 被动改写的引用源码不是编辑目标，与插删行列一致不受所在格锁定约束。
            HistoryChange::Cells {
                before,
                after,
                table_rows,
                dimensions,
                ..
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
            // Row/column shifts respect configured protection permissions; elsewhere, replay
            // restores just the rewritten formula and rule sources, like the forward edit.
            HistoryChange::Structure(change) => {
                let state = workbook.read_protection(self.sheet)?;
                if state.mode == crate::protection::ProtectionMode::Protected {
                    let allowed = match change.edit {
                        crate::shift::ShiftEdit::RowInsert { .. } => state.permissions.insert_rows,
                        crate::shift::ShiftEdit::ColInsert { .. } =>
                            state.permissions.insert_columns,
                        crate::shift::ShiftEdit::RowDelete { .. } => state.permissions.delete_rows,
                        crate::shift::ShiftEdit::ColDelete { .. } =>
                            state.permissions.delete_columns,
                    };
                    if !allowed {
                        return Err(crate::protection::PROTECTED_ERROR);
                    }
                    let physical = if undo {
                        match change.edit {
                            crate::shift::ShiftEdit::RowInsert { at, count } =>
                                crate::shift::ShiftEdit::RowDelete { at, count },
                            crate::shift::ShiftEdit::ColInsert { at, count } =>
                                crate::shift::ShiftEdit::ColDelete { at, count },
                            crate::shift::ShiftEdit::RowDelete { at, count } =>
                                crate::shift::ShiftEdit::RowInsert { at, count },
                            crate::shift::ShiftEdit::ColDelete { at, count } =>
                                crate::shift::ShiftEdit::ColInsert { at, count },
                        }
                    } else {
                        change.edit
                    };
                    workbook.ensure_structural_band_safe_on_protected(self.sheet, physical)?;
                }
                Ok(())
            }
            HistoryChange::CellShift(_) =>
                workbook.ensure_sheet_unprotected(self.sheet),
            // Table definitions lock only their own sheet; structured references follow.
            HistoryChange::TableDefinition(_) | HistoryChange::TableCreate(_) =>
                workbook.ensure_sheet_unprotected(self.sheet),
            HistoryChange::Consolidate(change) => {
                if change.changes_outline() {
                    workbook.ensure_sheet_unprotected(self.sheet)
                } else {
                    workbook.ensure_range_editable(self.sheet, self.range)
                }
            }
            // Names and custom formulas are workbook metadata, as in Excel; recalculating locked
            // formulas is not an edit. Interfaces still refuse them from a protected active sheet.
            HistoryChange::NamedRange(_) | HistoryChange::CustomFormula(_) => Ok(()),
            _ => workbook.ensure_sheet_unprotected(self.sheet),
        }
    }
}
