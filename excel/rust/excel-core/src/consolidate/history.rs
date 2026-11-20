//! Execute and replay a native consolidation edit as one reversible history entry.
use super::plan::{
    ConsolidateOverwriteApproval, ConsolidateReport, ConsolidateRequest,
};
use crate::history_snapshot::HistorySnapshot;
use crate::outline::SheetOutline;
use crate::workbook_history::MAX_BYTES;
use crate::{CellRange, Workbook};
use einfach_core::Value;

#[derive(Debug)]
pub(crate) struct ConsolidateChange {
    before_cells: HistorySnapshot,
    after_cells: HistorySnapshot,
    before_outline: SheetOutline,
    after_outline: SheetOutline,
}

impl ConsolidateChange {
    pub(crate) fn execute(
        workbook: &mut Workbook,
        request: &ConsolidateRequest,
        approval: Option<ConsolidateOverwriteApproval>,
    ) -> Result<(Self, ConsolidateReport), &'static str> {
        let plan = workbook.plan_consolidate(request)?;
        if plan.overwritten_cells > 0
            && approval
                != Some(ConsolidateOverwriteApproval {
                    target: plan.target,
                    count: plan.overwritten_cells,
                })
        {
            return Err("CONSOLIDATE_OVERWRITE_CONFIRMATION_REQUIRED");
        }
        let sheet_idx = request.sheet;
        let before_cells = HistorySnapshot::capture(
            workbook.sheet(sheet_idx).expect("validated sheet"),
            plan.target,
            true,
        );
        let before_outline = workbook.sheet(sheet_idx).expect("validated sheet").outline().clone();
        let mut after_outline = before_outline.clone();
        if !plan.outline_groups.is_empty() {
            after_outline.rows.extend(plan.outline_groups.iter().cloned());
            after_outline
                .rows
                .sort_by_key(|group| (group.start, std::cmp::Reverse(group.end)));
        }

        let estimated_bytes = before_cells.retained_bytes().saturating_mul(2)
            + crate::sheet::metadata_bytes(&plan.cells)
            + crate::sheet::metadata_bytes(&before_outline)
            + crate::sheet::metadata_bytes(&after_outline);
        if estimated_bytes > MAX_BYTES - 1024 {
            return Err("Consolidated output exceeds the undo memory limit. Choose smaller ranges.");
        }

        let mut planned_by_addr = std::collections::HashMap::with_capacity(plan.cells.len());
        for cell in &plan.cells {
            planned_by_addr.insert(cell.addr, cell);
        }
        let mut changed_cells = 0usize;
        let mut write_error: Option<&'static str> = None;
        let store = workbook.store.clone();
        store.batch(|_| {
            for addr in plan.target.iter() {
                let target_cell = planned_by_addr.get(&addr).copied();
                let sheet = workbook.sheet(sheet_idx).expect("validated sheet");
                let current_formula = sheet.formula_text_at(addr);
                let current_value = if current_formula.is_none() {
                    Some(sheet.peek_value(addr))
                } else {
                    None
                };
                match target_cell {
                    Some(snapshot) if snapshot.formula.is_some() => {
                        let formula = snapshot.formula.as_deref().unwrap();
                        if current_formula.as_deref() != Some(formula) {
                            let a1 = addr.to_string();
                            match workbook.try_set_formula(sheet_idx, &a1, formula) {
                                Ok(true) => changed_cells += 1,
                                _ => {
                                    write_error = Some("Could not write consolidated formula.");
                                    break;
                                }
                            }
                        }
                    }
                    Some(snapshot) => {
                        let value = snapshot.value.clone().unwrap_or(Value::Null);
                        if current_formula.is_some() || current_value.as_ref() != Some(&value) {
                            let a1 = addr.to_string();
                            if workbook.try_set_cell(sheet_idx, &a1, value).is_err() {
                                write_error = Some("Could not write consolidated value.");
                                break;
                            }
                            changed_cells += 1;
                        }
                    }
                    None => {
                        if current_formula.is_some()
                            || !matches!(current_value, Some(Value::Null))
                        {
                            let a1 = addr.to_string();
                            if workbook.try_set_cell(sheet_idx, &a1, Value::Null).is_err() {
                                write_error = Some("Could not clear destination cell.");
                                break;
                            }
                            changed_cells += 1;
                        }
                    }
                }
            }
            if write_error.is_none() && !plan.outline_groups.is_empty() {
                if let Err(err) = workbook.set_outline(sheet_idx, after_outline.clone()) {
                    write_error = Some(err);
                }
            }
        });
        if let Some(error) = write_error {
            let _ = before_cells.restore(workbook, sheet_idx);
            let _ = workbook.set_outline(sheet_idx, before_outline);
            return Err(error);
        }
        let after_cells = HistorySnapshot::capture(
            workbook.sheet(sheet_idx).expect("validated sheet"),
            plan.target,
            true,
        );
        Ok((
            Self {
                before_cells,
                after_cells,
                before_outline,
                after_outline,
            },
            ConsolidateReport {
                target: plan.target,
                changed_cells,
                linked_groups: plan.outline_groups.len(),
            },
        ))
    }

    pub(crate) fn changes_outline(&self) -> bool {
        self.before_outline != self.after_outline
    }

    pub(crate) fn apply(
        &self,
        workbook: &mut Workbook,
        sheet: usize,
        undo: bool,
    ) -> Result<(), &'static str> {
        let expected_outline = if undo {
            &self.after_outline
        } else {
            &self.before_outline
        };
        if workbook.is_inside_custom_call()
            || workbook
                .sheet(sheet)
                .is_none_or(|s| s.outline() != expected_outline)
        {
            return Err("The consolidated outline changed outside history.");
        }
        let cells = if undo { &self.before_cells } else { &self.after_cells };
        let outline = if undo {
            &self.before_outline
        } else {
            &self.after_outline
        };
        cells.restore(workbook, sheet)?;
        if self.changes_outline() {
            workbook.set_outline(sheet, outline.clone())?;
        }
        Ok(())
    }

    pub(crate) fn retained_bytes(&self) -> usize {
        self.before_cells.retained_bytes()
            + self.after_cells.retained_bytes()
            + crate::sheet::metadata_bytes(&self.before_outline)
            + crate::sheet::metadata_bytes(&self.after_outline)
    }

    pub(crate) fn mutation_ranges(&self, sheet: usize) -> Vec<(usize, Option<CellRange>)> {
        let mut ranges: Vec<_> = crate::host::changed_ranges(&self.before_cells, &self.after_cells)
            .into_iter()
            .map(|range| (sheet, Some(range)))
            .collect();
        if self.before_outline != self.after_outline {
            ranges.push((sheet, None));
        }
        ranges
    }
}
