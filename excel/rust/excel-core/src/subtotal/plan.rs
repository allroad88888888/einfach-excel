//! Plan one subtotal edit against the current worksheet facts.
use super::append_layout::appended_rows;
use super::layout::plan_subtotal_layout_with_grand_order;
use super::layout_contract::{SubtotalCalculation, SubtotalLayer};
use super::owned_output::{OwnedSubtotalRow, SubtotalLabels};
use super::read_details::{SubtotalDetails, MAX_SUBTOTAL_CELLS};
use super::region::{region_at, SubtotalRegion};
use super::request::{SubtotalAction, SubtotalRequest, SubtotalSettings};
use crate::sheet::{EXCEL_MAX_COLS, EXCEL_MAX_ROWS};
use crate::shift::ShiftEdit;
use crate::{CellRange, Workbook};
use std::collections::BTreeSet;
use std::ops::RangeInclusive;

pub(super) struct SubtotalPlan {
    pub(super) previous: Option<SubtotalRegion>,
    pub(super) next: Option<SubtotalRegion>,
    pub(super) edits: Vec<ShiftEdit>,
    pub(super) inserted: BTreeSet<u32>,
    pub(super) outline: Vec<RangeInclusive<u32>>,
    pub(super) range: CellRange,
}

impl Workbook {
    pub(super) fn plan_subtotals(
        &self,
        request: &SubtotalRequest,
    ) -> Result<SubtotalPlan, &'static str> {
        let sheet = self
            .sheet(request.sheet)
            .ok_or("The worksheet no longer exists.")?;
        self.ensure_sheet_unprotected(request.sheet)?;
        let selection = request.selection.normalize();
        if request.row_count == 0
            || request.row_count > EXCEL_MAX_ROWS
            || request.col_count == 0
            || request.col_count > EXCEL_MAX_COLS
            || selection.end.row >= request.row_count
            || selection.end.col >= request.col_count
        {
            return Err("Choose a list within the worksheet.");
        }
        let regions = &sheet.subtotal_regions;
        let current = region_at(regions, selection)?;
        let mut plan = SubtotalPlan {
            previous: current.cloned(),
            next: None,
            edits: Vec::new(),
            inserted: BTreeSet::new(),
            outline: Vec::new(),
            range: selection,
        };
        let append =
            matches!(&request.action, SubtotalAction::Apply(settings) if !settings.replace);
        let mut after_deletes = request.row_count;
        if let Some(region) = current {
            plan.range = region.output();
            for summary in &region.rows {
                summary.validate_owned(sheet)?;
            }
            if !append {
                self.validate_subtotal_metadata_removal(request.sheet, region)?;
                let mut previous_index: Option<usize> = None;
                for row in region.rows.iter().rev().map(|summary| summary.row) {
                    if row >= request.row_count {
                        return Err("Subtotal rows exceed the current worksheet canvas.");
                    }
                    let current_edit = previous_index.map(|index| &mut plan.edits[index]);
                    if let Some(ShiftEdit::RowDelete { at, count }) = current_edit {
                        if *at == row + 1 {
                            *at = row;
                            *count += 1;
                            continue;
                        }
                    }
                    previous_index = Some(plan.edits.len());
                    plan.edits.push(ShiftEdit::RowDelete { at: row, count: 1 });
                }
                after_deletes -= region.rows.len() as u32;
                if after_deletes == 0 {
                    return Err("Keep at least one row in the worksheet.");
                }
            }
        }
        let SubtotalAction::Apply(settings) = &request.action else {
            if let Some(existing) = current {
                plan.range = existing.source.into();
                plan.range.end.row = plan
                    .range
                    .end
                    .row
                    .saturating_sub(existing.rows.len() as u32)
                    .max(plan.range.start.row);
            }
            return Ok(plan);
        };
        let (range, skip) = match current {
            Some(region) => (region.source.into(), region.generated_rows()),
            None => (
                self.expand_subtotal_list(request.sheet, selection)?,
                BTreeSet::new(),
            ),
        };
        if current.is_none()
            && regions.iter().any(|region| {
                let other = region.output();
                range.start.row <= other.end.row && other.start.row <= range.end.row
            })
        {
            return Err("Choose a subtotal list on different rows from the existing subtotals.");
        }
        let details = self.read_subtotal_details(
            request.sheet,
            range,
            &skip,
            request.row_count,
            request.col_count,
        )?;
        plan.add_layout(
            self,
            request.sheet,
            details,
            settings,
            current.filter(|_| append),
            after_deletes,
            request.col_count,
        )?;
        Ok(plan)
    }
}

impl SubtotalPlan {
    #[allow(clippy::too_many_arguments)]
    fn add_layout(
        &mut self,
        workbook: &Workbook,
        sheet_index: usize,
        details: SubtotalDetails,
        settings: &SubtotalSettings,
        append: Option<&SubtotalRegion>,
        after_deletes: u32,
        col_count: u32,
    ) -> Result<(), &'static str> {
        let mut labels = SubtotalLabels {
            suffix: settings.total_suffix.clone(),
            grand_total: settings.grand_total.clone(),
        };
        if !labels.valid() {
            return Err("Subtotal labels must contain between 1 and 128 bytes.");
        }
        let mut calculation = settings.calculation.clone();
        calculation.columns.sort_unstable();
        let mut layers = Vec::new();
        let mut grand_total_order: Vec<SubtotalCalculation> = Vec::new();
        if let Some(current) = append {
            if current.layers.is_empty() || current.placement != settings.placement {
                return Err(
                    "Replace the current subtotals to change the group fields or summary position.",
                );
            }
            labels = current.labels.clone();
            layers = current.layers.clone();
            grand_total_order = if current.grand_total_order.is_empty() {
                let mut existing_order = Vec::new();
                for calc in current.layers.iter().flat_map(|layer| &layer.calculations) {
                    if !existing_order.contains(calc) {
                        existing_order.push(calc.clone());
                    }
                }
                existing_order
            } else {
                current.grand_total_order.clone()
            };
            let layer = layers
                .iter_mut()
                .find(|layer| layer.group_by_column == settings.group_by_column);
            if let Some(layer) = layer {
                if layer.calculations.contains(&calculation) {
                    return Ok(());
                }
                layer.calculations.push(calculation.clone());
            }
        }
        if !grand_total_order.contains(&calculation) {
            grand_total_order.push(calculation.clone());
        }
        if !layers
            .iter()
            .any(|layer| layer.group_by_column == settings.group_by_column)
        {
            layers.push(SubtotalLayer {
                group_by_column: settings.group_by_column,
                calculations: vec![calculation],
            });
        }

        let source = details.source;
        let desired = plan_subtotal_layout_with_grand_order(
            source,
            &details.records,
            &layers,
            &grand_total_order,
            settings.placement,
            EXCEL_MAX_ROWS,
            col_count,
        )?;
        let insertions = if let Some(existing) = append {
            let previous = plan_subtotal_layout_with_grand_order(
                source,
                &details.records,
                &existing.layers,
                &existing.grand_total_order,
                existing.placement,
                EXCEL_MAX_ROWS,
                col_count,
            )?;
            if previous
                .summaries
                .iter()
                .map(|row| OwnedSubtotalRow::from_plan(row, &labels))
                .ne(existing.rows.iter().cloned())
                || previous.target.end.row != existing.source.end_row
            {
                return Err("The detail grouping changed. Replace the current subtotals to rebuild the groups.");
            }
            let changes = appended_rows(
                source.start.row + 1,
                &previous.row_identities(),
                &desired.row_identities(),
            )?;
            self.inserted.extend(changes.new_rows);
            changes.insertions.into_iter().collect()
        } else {
            self.inserted
                .extend(desired.summaries.iter().map(|row| row.row));
            desired.insertions
        };
        let inserted_count = insertions.iter().map(|&(_, count)| count).sum::<u32>();
        if after_deletes.saturating_add(inserted_count) > EXCEL_MAX_ROWS
            || col_count > EXCEL_MAX_COLS
        {
            return Err("The worksheet size limit would be exceeded.");
        }
        let mut actual_source = source;
        actual_source.end.row = desired.target.end.row;
        if desired.target.cell_count() > MAX_SUBTOTAL_CELLS {
            return Err("Choose a smaller list so the subtotal rows fit within 100,000 cells.");
        }
        if desired.target.end.col > source.end.col {
            workbook.validate_subtotal_bounds_clear(sheet_index, desired.target)?;
        }
        self.range = desired.target;
        self.outline = desired.outline;
        self.edits.extend(
            insertions
                .into_iter()
                .rev()
                .map(|(at, count)| ShiftEdit::RowInsert { at, count }),
        );
        self.next = Some(SubtotalRegion {
            id: self.previous.as_ref().map_or(0, |region| region.id),
            source: actual_source.into(),
            output_column: desired.target.end.col,
            rows: desired
                .summaries
                .iter()
                .map(|row| OwnedSubtotalRow::from_plan(row, &labels))
                .collect(),
            layers,
            grand_total_order,
            placement: settings.placement,
            labels,
        });
        Ok(())
    }
}
