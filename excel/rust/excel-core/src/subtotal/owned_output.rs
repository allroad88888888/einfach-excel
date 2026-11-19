//! Identify generated subtotal content before a command removes an entire worksheet row.
use super::layout_contract::{SubtotalFunction, SubtotalLabel, SubtotalRow};
use crate::history_snapshot::HistorySnapshot;
use crate::sheet::EXCEL_MAX_COLS;
use crate::{CellAddress, CellRange, CellSnapshot, CellStyle, Sheet};
use einfach_core::Value;
use serde::{Deserialize, Serialize};
use std::ops::RangeInclusive;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct SubtotalLabels {
    pub(super) suffix: String,
    pub(super) grand_total: String,
}

impl SubtotalLabels {
    pub(super) fn valid(&self) -> bool {
        !self.suffix.trim().is_empty()
            && self.suffix.len() <= 128
            && !self.grand_total.trim().is_empty()
            && self.grand_total.len() <= 128
    }

    fn caption(&self, label: &SubtotalLabel) -> (u32, String) {
        match label {
            SubtotalLabel::Group { column, value } => (*column, format!("{value}{}", self.suffix)),
            SubtotalLabel::GrandTotal { column } => (*column, self.grand_total.clone()),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct OwnedSubtotalRow {
    pub(super) row: u32,
    pub(super) details: Option<RangeInclusive<u32>>,
    pub(super) columns: Vec<u32>,
    function: SubtotalFunction,
    label: Option<(u32, String)>,
}

pub(super) fn subtotal_cell_style() -> CellStyle {
    CellStyle {
        bold: Some(true),
        ..CellStyle::default()
    }
}

impl OwnedSubtotalRow {
    pub(super) fn from_plan(row: &SubtotalRow, labels: &SubtotalLabels) -> Self {
        let mut columns = row.calculation.columns.clone();
        columns.sort_unstable();
        Self {
            row: row.row,
            details: Some(row.details.clone()),
            label: Some(labels.caption(&row.label)),
            function: row.calculation.function,
            columns,
        }
    }

    pub(super) fn valid(&self, bounds: CellRange) -> bool {
        let fields = bounds.start.col..=bounds.end.col;
        let rows = bounds.start.row..=bounds.end.row;
        rows.contains(&self.row)
            && self.details.as_ref().is_none_or(|details| {
                rows.contains(details.start())
                    && rows.contains(details.end())
                    && !details.is_empty()
                    && !details.contains(&self.row)
            })
            && self.label.as_ref().is_none_or(|(col, label)| {
                fields.contains(col) && !self.columns.contains(col) && !label.is_empty()
            })
            && self.columns.windows(2).all(|pair| pair[0] < pair[1])
            && self.columns.iter().all(|col| fields.contains(col))
            && (!self.columns.is_empty() || self.label.is_some())
    }

    pub(super) fn shift_columns(&mut self, shift: impl Fn(u32) -> Option<u32>) -> bool {
        self.label = self
            .label
            .take()
            .and_then(|(col, label)| shift(col).map(|next| (next, label)));
        self.columns = self.columns.iter().filter_map(|&col| shift(col)).collect();
        !self.columns.is_empty() || self.label.is_some()
    }

    pub(super) fn cells(&self) -> Vec<CellSnapshot> {
        let mut cells = Vec::with_capacity(self.columns.len() + 1);
        if let Some((col, label)) = &self.label {
            cells.push(CellSnapshot::value(
                CellAddress::new(self.row, *col),
                Value::Text(label.as_str().into()),
            ));
        }
        for &column in &self.columns {
            let range = self.details.as_ref().map_or_else(
                || "#REF!".to_owned(),
                |details| {
                    let start = CellAddress::new(*details.start(), column);
                    let end = CellAddress::new(*details.end(), column);
                    format!("{start}:{end}")
                },
            );
            let function = self.function as u8;
            let formula = format!("=SUBTOTAL({function},{range})");
            cells.push(CellSnapshot::formula(
                CellAddress::new(self.row, column),
                formula,
            ));
        }
        cells.sort_by_key(|cell| cell.addr.col);
        cells
    }

    pub(super) fn validate_owned(&self, sheet: &Sheet) -> Result<(), &'static str> {
        let range = CellRange::new(
            CellAddress::new(self.row, 0),
            CellAddress::new(self.row, EXCEL_MAX_COLS - 1),
        );
        let current = HistorySnapshot::capture_with_merges(sheet, range, true, true);
        let cells = self.cells();
        if current.cells.as_deref() != Some(cells.as_slice())
            || current
                .formats
                .cell_styles
                .iter()
                .any(|(address, _)| cells.binary_search_by_key(&address.col, |c| c.addr.col).is_err())
            || current.formats.row_styles.iter().any(|(_, style)| {
                let mut without_height = style.clone();
                without_height.height = None;
                !without_height.is_empty()
            })
            || !current.rich_text.is_empty()
            || !current.hyperlinks.is_empty()
            || !current.notes.is_empty()
            || !current.comments.is_empty()
            || current
                .merges
                .as_ref()
                .is_some_and(|ranges| !ranges.is_empty())
            || sheet.spill_intersecting(range).is_some()
        {
            return Err("A generated subtotal row contains edited content. Review that row before replacing or removing subtotals.");
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::super::layout_contract::SubtotalCalculation;
    use super::*;
    use crate::Workbook;

    #[test]
    fn owned_row_keeps_independent_manual_cells_out_of_removal() {
        let mut workbook = Workbook::new();
        let labels = SubtotalLabels {
            suffix: " Total".into(),
            grand_total: "Grand Total".into(),
        };
        let row = OwnedSubtotalRow::from_plan(
            &SubtotalRow {
                row: 3,
                group_by_column: Some(0),
                details: 1..=2,
                label: SubtotalLabel::Group {
                    column: 0,
                    value: "East".into(),
                },
                calculation: SubtotalCalculation {
                    function: SubtotalFunction::Sum,
                    columns: vec![2],
                },
            },
            &labels,
        );
        workbook.set_cell(0, "A4", Value::Text("East Total".into()));
        assert!(workbook.set_formula(0, "C4", "=SUBTOTAL(9,C2:C3)"));
        for cell in row.cells() {
            workbook.sheet_mut(0).unwrap().patch_format_range(
                CellRange::single(cell.addr),
                crate::StyleScope::Cell,
                subtotal_cell_style(),
            );
        }
        assert!(row.validate_owned(workbook.sheet(0).unwrap()).is_ok());
        workbook.set_cell(0, "H4", Value::Text("Manual note".into()));
        assert!(row.validate_owned(workbook.sheet(0).unwrap()).is_err());
    }
}
