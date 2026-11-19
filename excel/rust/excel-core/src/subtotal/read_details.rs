//! Read and validate a native subtotal list, retaining its current detail row identities.
use crate::sheet::{collapse_array_for_eval, EXCEL_MAX_COLS, EXCEL_MAX_ROWS};
use crate::{value_to_display, CellAddress, CellRange, Workbook};
use einfach_core::Value;
use std::collections::{BTreeSet, HashSet};

pub(super) const MAX_SUBTOTAL_CELLS: u32 = 100_000;

use super::request::SubtotalField;

pub(super) struct SubtotalDetails {
    pub(super) source: CellRange,
    pub(super) fields: Vec<SubtotalField>,
    pub(super) records: Vec<Vec<Value>>,
}

impl Workbook {
    pub(super) fn validate_subtotal_bounds_clear(
        &self,
        sheet_index: usize,
        range: CellRange,
    ) -> Result<(), &'static str> {
        let sheet = self
            .sheet(sheet_index)
            .ok_or("The worksheet no longer exists.")?;
        if self.list_tables().into_iter().any(|table| {
            Some(table.sheet_name()) == self.name(sheet_index) && table.range().intersects(range)
        }) {
            return Err("Convert the Table to a normal range before inserting subtotals.");
        }
        if sheet
            .merged_ranges()
            .iter()
            .any(|merged| merged.intersects(range))
            || sheet.spill_intersecting(range).is_some()
        {
            return Err("Choose a subtotal range without merged cells or spilled formulas.");
        }
        Ok(())
    }

    pub(super) fn read_subtotal_details(
        &self,
        sheet_index: usize,
        current: CellRange,
        generated: &BTreeSet<u32>,
        row_count: u32,
        col_count: u32,
    ) -> Result<SubtotalDetails, &'static str> {
        if row_count > EXCEL_MAX_ROWS
            || col_count > EXCEL_MAX_COLS
            || current.start.row >= current.end.row
            || current.start.col > current.end.col
            || current.end.row >= row_count
            || current.end.col >= col_count
            || generated.contains(&current.start.row)
        {
            return Err("Choose a list with headings and detail rows within the worksheet.");
        }
        if current.cell_count() > MAX_SUBTOTAL_CELLS {
            return Err("Choose a subtotal list of at most 100,000 cells.");
        }
        self.validate_subtotal_bounds_clear(sheet_index, current)?;

        let width = current.cols() as usize;
        let mut values = vec![Value::Null; current.cell_count() as usize];
        self.for_each_sparse_range_cell(sheet_index, current, |address, value| {
            let row = (address.row - current.start.row) as usize;
            let col = (address.col - current.start.col) as usize;
            values[row * width + col] = collapse_array_for_eval(value);
        });
        let mut names = HashSet::new();
        let fields = values[..width]
            .iter()
            .enumerate()
            .map(|(index, value)| {
                let name = value_to_display(value);
                if matches!(value, Value::Error(_))
                    || name.trim().is_empty()
                    || !names.insert(name.to_lowercase())
                {
                    return Err("Use nonempty, distinct headings in the subtotal list.");
                }
                Ok(SubtotalField {
                    column: current.start.col + index as u32,
                    name,
                })
            })
            .collect::<Result<Vec<_>, _>>()?;
        let records: Vec<_> = values
            .chunks_exact(width)
            .skip(1)
            .enumerate()
            .filter_map(|(index, record)| {
                let row = current.start.row + 1 + index as u32;
                (!generated.contains(&row)).then(|| record.to_vec())
            })
            .collect();
        if records.is_empty()
            || records
                .iter()
                .flatten()
                .all(|value| matches!(value, Value::Null))
        {
            return Err("Choose a list containing detail records.");
        }
        let end = CellAddress::new(current.start.row + records.len() as u32, current.end.col);
        Ok(SubtotalDetails {
            source: CellRange::new(current.start, end),
            fields,
            records,
        })
    }
}
