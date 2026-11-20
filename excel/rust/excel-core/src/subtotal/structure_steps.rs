//! Apply row geometry as part of one native subtotal history command.
use crate::shift::ShiftEdit;
use crate::workbook::StructuralHistoryChange;
use crate::Workbook;
use std::collections::BTreeSet;

#[derive(Debug, Default)]
pub(super) struct SubtotalStructure {
    changes: Vec<StructuralHistoryChange>,
    bytes: usize,
}

impl SubtotalStructure {
    /// Called inside the subtotal Store batch. A rejected budget still retains the last
    /// completed change so the outer transaction can restore every applied step.
    pub(super) fn edit(
        &mut self,
        workbook: &mut Workbook,
        sheet: usize,
        edit: ShiftEdit,
        available_bytes: usize,
    ) -> Result<(), &'static str> {
        if let Some((change, _)) = StructuralHistoryChange::edit(workbook, sheet, edit)? {
            self.bytes = self.bytes.saturating_add(change.retained_bytes());
            self.changes.push(change);
        }
        if self.bytes > available_bytes {
            return Err("Subtotal rows exceed the undo memory limit. Choose a smaller list.");
        }
        Ok(())
    }

    pub(super) fn retained_bytes(&self) -> usize {
        self.bytes
    }

    pub(super) fn affected_sheets(&self) -> BTreeSet<usize> {
        self.changes
            .iter()
            .flat_map(StructuralHistoryChange::affected_sheets)
            .collect()
    }

    pub(super) fn mutation_ranges(&self) -> Vec<(usize, Option<crate::CellRange>)> {
        self.changes
            .iter()
            .flat_map(StructuralHistoryChange::mutation_ranges)
            .collect()
    }

    pub(super) fn edits(&self) -> Vec<ShiftEdit> {
        self.changes.iter().map(|change| change.edit).collect()
    }

    pub(super) fn replay(
        &self,
        workbook: &mut Workbook,
        sheet: usize,
        undo: bool,
    ) -> Result<(), &'static str> {
        let mut completed: Vec<&StructuralHistoryChange> = Vec::new();
        let count = self.changes.len();
        for index in 0..count {
            let step = &self.changes[if undo { count - index - 1 } else { index }];
            if let Err(error) = step.apply(workbook, sheet, undo) {
                for prior in completed.into_iter().rev() {
                    prior.apply(workbook, sheet, !undo)?;
                }
                return Err(error);
            }
            completed.push(step);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use einfach_core::Value;

    #[test]
    fn a_multi_row_plan_replays_in_both_directions_with_qualified_formulas() {
        let mut book = Workbook::new();
        let report = book.add_sheet("Report");
        book.set_cell(0, "A4", Value::Number(3.0));
        book.set_cell(0, "A5", Value::Number(4.0));
        assert!(book.set_formula(report, "A1", "=Sheet1!A4"));
        let mut change = SubtotalStructure::default();
        change
            .edit(
                &mut book,
                0,
                ShiftEdit::RowInsert { at: 4, count: 1 },
                32 * 1024 * 1024,
            )
            .unwrap();
        change
            .edit(
                &mut book,
                0,
                ShiftEdit::RowInsert { at: 2, count: 1 },
                32 * 1024 * 1024,
            )
            .unwrap();
        assert_eq!(change.affected_sheets(), [0, 1].into());
        assert_eq!(
            book.sheet(report).unwrap().get_formula("A1").as_deref(),
            Some("=Sheet1!A5")
        );
        assert_eq!(book.get_cell("Report", "A1"), Value::Number(3.0));
        change.replay(&mut book, 0, true).unwrap();
        assert_eq!(
            book.sheet(report).unwrap().get_formula("A1").as_deref(),
            Some("=Sheet1!A4")
        );
        assert_eq!(book.get_cell("Sheet1", "A5"), Value::Number(4.0));
        change.replay(&mut book, 0, false).unwrap();
        assert_eq!(book.get_cell("Sheet1", "A7"), Value::Number(4.0));
    }

    #[test]
    fn late_budget_rejection_keeps_a_before_image_for_every_applied_edit() {
        let mut book = Workbook::new();
        book.set_cell(0, "B5", Value::Text("Tail".into()));
        let mut change = SubtotalStructure::default();
        assert!(change
            .edit(&mut book, 0, ShiftEdit::RowInsert { at: 2, count: 1 }, 1)
            .is_err());
        assert_eq!(change.edits(), [ShiftEdit::RowInsert { at: 2, count: 1 }]);
        change.replay(&mut book, 0, true).unwrap();
        assert_eq!(book.get_cell("Sheet1", "B5"), Value::Text("Tail".into()));
        assert_eq!(book.get_cell("Sheet1", "B6"), Value::Null);
    }
}
