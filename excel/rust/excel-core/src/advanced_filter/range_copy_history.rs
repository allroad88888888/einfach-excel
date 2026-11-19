//! Copy filtered values as one undoable native edit.
use super::*;
use crate::advanced_filter::range_contract::{
    AdvancedFilterCopy, AdvancedFilterCopyReport, FilterOverwriteApproval,
};
use crate::{CellStyle, NumberFormat, StyleScope};
use einfach_core::Value;

impl WorkbookHistory {
    pub fn copy_advanced_filter(
        &mut self,
        workbook: &mut Workbook,
        request: &AdvancedFilterCopy,
        approval: Option<FilterOverwriteApproval>,
    ) -> Result<AdvancedFilterCopyReport, &'static str> {
        if self.pending.is_some() || workbook.is_inside_custom_call() {
            return Err("Another mutation is in progress.");
        }
        let plan = workbook
            .plan_advanced_filter_copy(request)
            .map_err(|error| match error {
                crate::FilterError::InvalidCriteria(message) => message,
                crate::FilterError::InvalidSheet => "The worksheet no longer exists.",
                crate::FilterError::ProtectedWorksheet => crate::protection::PROTECTED_ERROR,
                _ => "Choose a header and data rows for the filter.",
            })?;
        if plan.overwritten_cells > 0
            && approval
                != Some(FilterOverwriteApproval {
                    target: plan.target,
                    count: plan.overwritten_cells,
                })
        {
            return Err("ADVANCED_FILTER_OVERWRITE_CONFIRMATION_REQUIRED");
        }
        self.begin(
            workbook,
            request.sheet,
            plan.target,
            "Copy filtered records",
            true,
        )?;
        let before = &self
            .pending
            .as_ref()
            .expect("copy transaction began")
            .before[0]
            .1;
        let bytes = plan
            .fields
            .iter()
            .map(|field| {
                let value_bytes = if let Value::Text(text) = &field.value {
                    text.len()
                } else {
                    0
                };
                let format_bytes = match &field.format {
                    NumberFormat::Custom(text)
                    | NumberFormat::Date(text)
                    | NumberFormat::Time(text)
                    | NumberFormat::Currency { symbol: text, .. }
                    | NumberFormat::Accounting { symbol: text, .. } => text.len(),
                    _ => 0,
                };
                256usize
                    .saturating_add(value_bytes)
                    .saturating_add(format_bytes)
            })
            .fold(0, usize::saturating_add);
        if before
            .retained_bytes()
            .saturating_mul(2)
            .saturating_add(bytes)
            > MAX_BYTES
        {
            self.pending = None;
            return Err("Filter output exceeds the undo memory limit. Choose a smaller source.");
        }

        let workbook_store = workbook.store.clone();
        let mut result = Ok(());
        let mut changed = Vec::new();
        workbook_store.batch(|_| {
            result = plan
                .target
                .iter()
                .zip(plan.fields)
                .try_for_each(|(address, field)| {
                    let cell = address.to_string();
                    let sheet = workbook
                        .sheet(request.sheet)
                        .expect("validated output sheet");
                    let format_changed = sheet.get_format(&cell).number_format != field.format;
                    let value_changed =
                        sheet.has_formula_at(address) || sheet.peek_value(address) != field.value;
                    if value_changed {
                        workbook
                            .try_set_cell(request.sheet, &cell, field.value)
                            .map_err(|_| "Could not write filtered output.")?;
                    }
                    if format_changed {
                        workbook
                            .sheet_mut(request.sheet)
                            .expect("validated output sheet")
                            .patch_format_range(
                                CellRange::single(address),
                                StyleScope::Cell,
                                CellStyle {
                                    number_format: Some(field.format),
                                    ..Default::default()
                                },
                            );
                    }
                    if value_changed || format_changed {
                        changed.push(address);
                    }
                    Ok(())
                });
            result = result.and_then(|_| {
                workbook.settle_validation_candidate(request.sheet, plan.target);
                changed.iter().try_for_each(|&address| {
                    let sheet = workbook
                        .sheet(request.sheet)
                        .expect("validated output sheet");
                    workbook.validate_input_value(
                        request.sheet,
                        address,
                        &sheet.peek_value(address),
                    )
                })
            });
            if let Err(error) = self.finish(workbook, result.is_ok()) {
                result = Err(error);
            }
        });
        result?;
        Ok(AdvancedFilterCopyReport {
            target: plan.target,
            matched_rows: plan.matched_rows,
            changed_cells: changed.len(),
        })
    }
}
