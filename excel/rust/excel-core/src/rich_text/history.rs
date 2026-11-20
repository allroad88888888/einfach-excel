use super::*;
use crate::rich_text::{normalize_runs, RichTextRun};
use crate::TableError;
use einfach_core::Value;

/// Trims leading/trailing whitespace from rich text runs while preserving inner run formatting.
fn trim_rich_text_runs(mut runs: Vec<RichTextRun>) -> Result<Vec<RichTextRun>, &'static str> {
    while let Some(first) = runs.first_mut() {
        let trimmed = first.text.trim_start();
        if trimmed.is_empty() {
            runs.remove(0);
        } else {
            if trimmed.len() != first.text.len() {
                first.text = trimmed.to_owned();
            }
            break;
        }
    }
    while let Some(last) = runs.last_mut() {
        let trimmed = last.text.trim_end();
        if trimmed.is_empty() {
            runs.pop();
        } else {
            if trimmed.len() != last.text.len() {
                last.text = trimmed.to_owned();
            }
            break;
        }
    }
    normalize_runs(runs)
}

impl WorkbookHistory {
    pub fn change_rich_text(
        &mut self,
        workbook: &mut Workbook,
        sheet: usize,
        addr: crate::CellAddress,
        runs: Vec<RichTextRun>,
    ) -> Result<bool, String> {
        if self.pending.is_some() || workbook.is_inside_custom_call() {
            return Err("Another history command is pending.".into());
        }
        let range = CellRange::single(addr);
        validate_target(workbook, sheet, range).map_err(str::to_string)?;
        let mut runs = normalize_runs(runs).map_err(str::to_string)?;
        let target = workbook.sheet(sheet).unwrap();
        if target.spill_anchor_for(addr).is_some_and(|anchor| anchor != addr)
            || target.merged_range_at(addr).is_some_and(|range| range.start != addr)
        {
            return Err("Select the anchor cell before editing rich text.".into());
        }

        let table_info = workbook.name(sheet).and_then(|sheet_name| {
            workbook
                .list_tables()
                .into_iter()
                .find(|entry| entry.sheet_name() == sheet_name && entry.range().contains(addr))
                .map(|entry| {
                    let is_header = entry.has_headers() && entry.range().start.row == addr.row;
                    let is_insert_row = entry.has_insert_row()
                        && addr.row == entry.range().start.row + u32::from(entry.has_headers());
                    let column = entry.columns()[(addr.col - entry.range().start.col) as usize]
                        .clone();
                    let has_calculated = entry.calculated_columns().iter().any(Option::is_some);
                    (
                        entry.name().to_string(),
                        column,
                        is_header,
                        is_insert_row,
                        has_calculated,
                    )
                })
        });

        if let Some((table_name, old_column, is_header, is_insert_row, has_calculated)) = table_info
        {
            if is_header {
                runs = trim_rich_text_runs(runs).map_err(str::to_string)?;
                let trimmed_text: String = runs.iter().map(|run| run.text.as_str()).collect();
                if trimmed_text.is_empty() {
                    return Err(TableError::InvalidColumnName.to_string());
                }
                if old_column != trimmed_text {
                    workbook.ensure_sheet_unprotected(sheet).map_err(str::to_string)?;
                    let Some(mut change) = crate::workbook::TableDefinitionChange::prepare_column_rename(
                        workbook,
                        &table_name,
                        &old_column,
                        &trimmed_text,
                    )
                    .map_err(|error| error.to_string())?
                    else {
                        return Ok(false);
                    };
                    change.set_header_rich_text(addr, runs);
                    change.apply_validated_header(workbook, addr)?;
                    self.record_table_change(workbook, change, "Edit rich text");
                    return Ok(true);
                }
            } else if is_insert_row && has_calculated {
                let text: String = runs.iter().map(|run| run.text.as_str()).collect();
                if !text.is_empty() {
                    let expand = workbook.ensure_sheet_unprotected(sheet).is_ok();
                    let literal_input = format!("'{text}");
                    if let Some(mut change) =
                        crate::workbook::TableDefinitionChange::prepare_insert_row_input(
                            workbook,
                            sheet,
                            addr,
                            &literal_input,
                            expand,
                        )?
                    {
                        change.apply_expanding_rich_text(
                            workbook,
                            addr,
                            &literal_input,
                            runs,
                            expand,
                        )?;
                        self.record_table_change(workbook, change, "Edit rich text");
                        return Ok(true);
                    }
                }
            }
        }

        let target = workbook.sheet(sheet).unwrap();
        let text: String = runs.iter().map(|run| run.text.as_str()).collect();
        let value = if text.is_empty() { Value::Null } else { Value::Text(text.into()) };
        if target.formula_text_at(addr).is_none()
            && target.peek_value(addr) == value
            && target.rich_text(addr).unwrap_or_default() == runs
        {
            return Ok(false);
        }
        self.begin(workbook, sheet, range, "Edit rich text", true)
            .map_err(str::to_string)?;
        let store = workbook.store.clone();
        let mut result: Result<(), &'static str> = Ok(());
        store.batch(|_| {
            result = workbook.apply_validated_input(sheet, addr, |book| {
                book.try_set_cell(sheet, &addr.to_string(), value)
                    .map_err(|_| "Could not update rich text.")?;
                book.sheet_mut(sheet).unwrap().set_rich_text(addr, runs)
            });
            if let Err(error) = self.finish(workbook, result.is_ok()) {
                result = Err(error);
            }
        });
        result.map(|()| true).map_err(str::to_string)
    }
}
