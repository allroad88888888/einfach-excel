//! Execute and replay a subtotal edit as one native workbook transaction.
use super::request::{SubtotalReport, SubtotalRequest};
use super::state::SubtotalState;
use super::structure_steps::SubtotalStructure;
use super::write_output::write_subtotal_cells;
use crate::shift::ShiftEdit;
use crate::workbook_history::MAX_BYTES;
use crate::{CellRange, CellSnapshot, Sheet, Workbook};
use std::collections::BTreeSet;

#[derive(Debug)]
pub(crate) struct SubtotalChange {
    structure: SubtotalStructure,
    before: SubtotalState,
    after: SubtotalState,
    cells: Vec<CellSnapshot>,
    range: CellRange,
}

impl SubtotalChange {
    pub(crate) fn execute(
        workbook: &mut Workbook,
        request: &SubtotalRequest,
    ) -> Result<Option<(Self, SubtotalReport)>, &'static str> {
        let mut plan = workbook.plan_subtotals(request)?;
        if plan.edits.is_empty() {
            return Ok(None);
        }
        workbook.reserve_conditional_format_changes(plan.edits.len().saturating_mul(2))?;
        let sheet = request.sheet;
        let before = SubtotalState::capture(workbook, sheet);
        if let Some(next) = &mut plan.next {
            if next.id == 0 {
                next.id = before
                    .regions
                    .iter()
                    .map(|region| region.id)
                    .max()
                    .unwrap_or(0)
                    .checked_add(1)
                    .ok_or("Too many subtotal lists.")?;
            }
        }
        let mut structure = SubtotalStructure::default();
        let mut cells = Vec::new();
        let mut after = None;
        let available = MAX_BYTES.saturating_sub(before.retained_bytes() + 1024);
        with_sheet_batch(workbook, |book| {
            let outcome = (|| {
                if let (Some(previous), Some(ShiftEdit::RowDelete { .. })) =
                    (&plan.previous, plan.edits.first())
                {
                    let mut ready = SubtotalState::capture(book, sheet);
                    ready.remove_region(previous.id);
                    ready.restore(book, sheet);
                }
                for &edit in &plan.edits {
                    reject_table_overlap(book, sheet, edit)?;
                    structure.edit(book, sheet, edit, available)?;
                }
                let mut state = SubtotalState::capture(book, sheet);
                if let Some(next) = plan.next {
                    cells = next
                        .rows
                        .iter()
                        .filter(|summary| plan.inserted.contains(&summary.row))
                        .flat_map(|summary| summary.cells())
                        .collect();
                    for summary in next
                        .rows
                        .iter()
                        .filter(|summary| !plan.inserted.contains(&summary.row))
                    {
                        summary.validate_owned(&book.sheets[sheet])?;
                    }
                    state = state.with_region(next, &plan.outline)?;
                }
                let bytes = structure.retained_bytes()
                    + before.retained_bytes()
                    + state.retained_bytes()
                    + crate::sheet::metadata_bytes(&cells);
                if bytes > MAX_BYTES - 1024 {
                    return Err(
                        "Subtotal rows exceed the undo memory limit. Choose a smaller list.",
                    );
                }
                write_subtotal_cells(book, sheet, &cells, plan.range, true)?;
                state.restore(book, sheet);
                after = Some(state);
                Ok(())
            })();
            if outcome.is_err() {
                structure
                    .replay(book, sheet, true)
                    .expect("forward subtotal reserves rollback");
                before.restore(book, sheet);
            }
            outcome
        })?;
        Ok(Some((
            Self {
                structure,
                before,
                after: after.expect("successful subtotal owns a final state"),
                cells,
                range: plan.range,
            },
            SubtotalReport {
                range: plan.range,
                edits: plan.edits,
            },
        )))
    }

    pub(crate) fn apply(
        &self,
        workbook: &mut Workbook,
        sheet: usize,
        undo: bool,
    ) -> Result<(), &'static str> {
        let expected = if undo { &self.after } else { &self.before };
        if workbook.is_inside_custom_call() || !expected.matches(workbook, sheet) {
            return Err("The subtotal rows or outline changed outside history.");
        }
        workbook
            .reserve_conditional_format_changes(self.structure.edits().len().saturating_mul(2))?;
        with_sheet_batch(workbook, |book| {
            self.structure.replay(book, sheet, undo)?;
            if !undo {
                if let Err(error) =
                    write_subtotal_cells(book, sheet, &self.cells, self.range, false)
                {
                    self.structure
                        .replay(book, sheet, true)
                        .expect("subtotal replay reserves rollback");
                    self.before.restore(book, sheet);
                    return Err(error);
                }
            }
            (if undo { &self.before } else { &self.after }).restore(book, sheet);
            Ok(())
        })
    }

    pub(crate) fn retained_bytes(&self) -> usize {
        self.structure.retained_bytes()
            + self.before.retained_bytes()
            + self.after.retained_bytes()
            + crate::sheet::metadata_bytes(&self.cells)
    }

    pub(crate) fn affected_sheets(&self) -> BTreeSet<usize> {
        self.structure.affected_sheets()
    }

    pub(crate) fn edits(&self) -> Vec<ShiftEdit> {
        self.structure.edits()
    }

    pub(crate) fn mutation_ranges(&self, sheet: usize) -> Vec<(usize, Option<CellRange>)> {
        let mut ranges = self.structure.mutation_ranges();
        ranges.extend(
            self.cells
                .iter()
                .map(|cell| (sheet, Some(CellRange::single(cell.addr)))),
        );
        ranges
    }
}

fn with_sheet_batch<T>(
    workbook: &mut Workbook,
    f: impl FnOnce(&mut Workbook) -> Result<T, &'static str>,
) -> Result<T, &'static str> {
    let observers: Vec<_> = workbook
        .sheets
        .iter_mut()
        .map(Sheet::suspend_structure_notifications)
        .collect();
    let store = workbook.store.clone();
    let mut result = None;
    store.batch(|_| result = Some(f(workbook)));
    for (sheet, observer) in workbook.sheets.iter_mut().zip(observers) {
        sheet.resume_structure_notifications(observer);
    }
    result.expect("subtotal batch ran")
}

fn reject_table_overlap(
    workbook: &Workbook,
    sheet: usize,
    edit: ShiftEdit,
) -> Result<(), &'static str> {
    let conflicts = workbook
        .list_tables()
        .into_iter()
        .filter(|table| Some(table.sheet_name()) == workbook.name(sheet))
        .any(|table| {
            let rows = table.range().start.row..=table.range().end.row;
            match edit {
                ShiftEdit::RowInsert { at, .. } => *rows.start() < at && at <= *rows.end(),
                ShiftEdit::RowDelete { at, count } => {
                    at <= *rows.end() && *rows.start() < at + count
                }
                _ => false,
            }
        });
    if conflicts {
        return Err("A generated subtotal row would change an existing Table.");
    }
    Ok(())
}
