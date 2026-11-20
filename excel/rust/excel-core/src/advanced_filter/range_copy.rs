//! Plan copy output without changing the source, criteria, or visibility.
use crate::advanced_filter::range_contract::{
    AdvancedFilterCopy, AdvancedFilterCopyPreview, MAX_RECORD_CELLS,
};
use crate::sheet::{EXCEL_MAX_COLS, EXCEL_MAX_ROWS};
use crate::{
    value_to_display, CellAddress, CellFormat, CellRange, FilterError, NumberFormat, Workbook,
};
use einfach_core::Value;
use std::collections::HashSet;

pub(crate) struct CopyField {
    pub(crate) value: Value,
    pub(crate) format: NumberFormat,
}

impl CopyField {
    fn display(&self) -> String {
        match (&self.value, &self.format) {
            (Value::Number(number), format) => CellFormat {
                number_format: format.clone(),
                ..Default::default()
            }
            .format_number(*number),
            (Value::Text(text), NumberFormat::Custom(pattern)) => {
                crate::custom_number_format::format_text(pattern, text)
                    .map_or_else(|| text.to_string(), |formatted| formatted.text)
            }
            _ => value_to_display(&self.value),
        }
    }
}

pub(crate) struct AdvancedFilterCopyPlan {
    pub(crate) target: CellRange,
    pub(crate) matched_rows: usize,
    pub(crate) overwritten_cells: usize,
    pub(crate) fields: Vec<CopyField>,
}

impl Workbook {
    pub fn preview_advanced_filter_copy(
        &self,
        request: &AdvancedFilterCopy,
    ) -> Result<AdvancedFilterCopyPreview, FilterError> {
        let plan = self.plan_advanced_filter_copy(request)?;
        let width = plan.target.cols() as usize;
        let mut sample_truncated = plan.target.rows() > 20 || width > 12;
        let sample = plan
            .fields
            .chunks_exact(width)
            .take(20)
            .map(|record| {
                record
                    .iter()
                    .take(12)
                    .map(|field| {
                        let display = field.display();
                        let mut chars = display.chars();
                        let prefix = chars.by_ref().take(120).collect();
                        sample_truncated |= chars.next().is_some();
                        prefix
                    })
                    .collect()
            })
            .collect();
        Ok(AdvancedFilterCopyPreview {
            target: plan.target,
            matched_rows: plan.matched_rows,
            overwritten_cells: plan.overwritten_cells,
            sample,
            sample_truncated,
        })
    }

    pub(crate) fn plan_advanced_filter_copy(
        &self,
        request: &AdvancedFilterCopy,
    ) -> Result<AdvancedFilterCopyPlan, FilterError> {
        let result = self.read_advanced_filter_copy(request);
        self.store.settle_pending_reads();
        result
    }

    fn read_advanced_filter_copy(
        &self,
        request: &AdvancedFilterCopy,
    ) -> Result<AdvancedFilterCopyPlan, FilterError> {
        let scan = self.scan_advanced_filter(request.selection)?;
        let source = request.selection.source;
        let source_sheet = self.sheet(source.sheet).ok_or(FilterError::InvalidSheet)?;
        let sheet = self.sheet(request.sheet).ok_or(FilterError::InvalidSheet)?;
        let mut selected = HashSet::new();
        let fields: Vec<usize> = if request.output_fields.is_empty() {
            (0..source.range.cols() as usize).collect()
        } else {
            request
                .output_fields
                .iter()
                .map(|name| {
                    scan.columns
                        .get(&name.to_lowercase())
                        .copied()
                        .filter(|field| selected.insert(*field))
                        .ok_or(FilterError::InvalidCriteria(
                            "Choose distinct output headings from the source.",
                        ))
                })
                .collect::<Result<_, _>>()?
        };
        let matched_rows = scan.matched_rows.len();
        let height = matched_rows as u32 + 1;
        let width = fields.len() as u32;
        let start = request.destination;
        if request.row_count > EXCEL_MAX_ROWS
            || request.col_count > EXCEL_MAX_COLS
            || height > request.row_count.saturating_sub(start.row)
            || width > request.col_count.saturating_sub(start.col)
        {
            return Err(FilterError::InvalidCriteria(
                "Filter output exceeds the worksheet boundary.",
            ));
        }
        if height.saturating_mul(width) > MAX_RECORD_CELLS {
            return Err(FilterError::InvalidCriteria(
                "Copy at most 100,000 cells per operation.",
            ));
        }
        let target = CellRange::new(
            start,
            CellAddress::new(start.row + height - 1, start.col + width - 1),
        );
        if (request.sheet == source.sheet && source.range.intersects(target))
            || request.selection.criteria.is_some_and(|criteria| {
                criteria.sheet == request.sheet && criteria.range.intersects(target)
            })
        {
            return Err(FilterError::InvalidCriteria(
                "Choose an output outside the source and criteria ranges.",
            ));
        }
        self.ensure_range_editable(request.sheet, target)
            .map_err(|_| FilterError::ProtectedWorksheet)?;
        if self.tables.values().any(|table| {
            Some(table.sheet_name()) == self.name(request.sheet) && table.range().intersects(target)
        }) || !self
            .insert_rows_for_ranges(&[(request.sheet, target, true)])
            .is_empty()
        {
            return Err(FilterError::InvalidCriteria(
                "Choose an output outside Excel Tables.",
            ));
        }
        if sheet
            .merged_ranges()
            .iter()
            .any(|merged| merged.intersects(target))
        {
            return Err(FilterError::InvalidCriteria(
                "Unmerge cells in the output range.",
            ));
        }
        let overwritten_cells = target
            .iter()
            .filter(|&address| {
                sheet.has_formula_at(address) || !matches!(sheet.peek_value(address), Value::Null)
            })
            .count();
        if sheet.spill_intersecting(target).is_some() {
            return Err(FilterError::InvalidCriteria(
                "Choose an output outside spilled arrays.",
            ));
        }
        let values = std::iter::once(source.range.start.row)
            .chain(scan.matched_rows.iter().copied())
            .flat_map(|row| {
                let record = scan.record(row);
                fields.iter().map(move |&index| {
                    let address = CellAddress::new(row, source.range.start.col + index as u32);
                    let value = record[index].clone();
                    let format = source_sheet.base_format_at(address).number_format;
                    CopyField { value, format }
                })
            })
            .collect();
        Ok(AdvancedFilterCopyPlan {
            target,
            matched_rows,
            overwritten_cells,
            fields: values,
        })
    }
}
