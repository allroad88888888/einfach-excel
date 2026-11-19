//! Prepare mixed value and color criteria for a single row placement.

use std::cmp::Ordering;

use einfach_core::Value;

use crate::cell::CellAddress;
use crate::range::CellRange;
use crate::sheet::collapse_array_for_eval;
use crate::workbook::Workbook;

use super::color_key::SortColorKey;
use super::compare::compare_key_values;
use super::{SortKey, SortRangeError, SortRangeReport};

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SortCriterion {
    Value(SortKey),
    Color(SortColorKey),
}

impl SortCriterion {
    fn column(&self) -> u32 {
        match self {
            Self::Value(key) => key.col,
            Self::Color(key) => key.col,
        }
    }
}

enum PreparedColumn<'a> {
    Value(&'a SortKey, Vec<Value>),
    Color(SortColorKey, Vec<bool>),
}

impl PreparedColumn<'_> {
    fn compare(&self, a: usize, b: usize) -> Ordering {
        match self {
            Self::Value(key, values) => compare_key_values(key, &values[a], &values[b]),
            Self::Color(key, matches) => key.compare(matches[a], matches[b]),
        }
    }
}

impl Workbook {
    pub fn sort_range_by_criteria(
        &mut self,
        sheet: usize,
        range: CellRange,
        keys: &[SortCriterion],
        excluded_rows: &[u32],
    ) -> Result<SortRangeReport, SortRangeError> {
        let range = range.normalize();
        let target = self.sheet(sheet).ok_or(SortRangeError::InvalidRange)?;
        self.ensure_range_editable(sheet, range).map_err(|_| SortRangeError::ProtectedRange)?;
        let slots = target.sort_slots(range, keys.iter().map(SortCriterion::column), excluded_rows)?;
        if slots.len() <= 1 {
            return Ok(SortRangeReport::default());
        }

        let color_keys: Vec<_> = keys.iter().filter_map(|key| match key {
            SortCriterion::Value(_) => None,
            SortCriterion::Color(color) => Some(*color),
        }).collect();
        let mut color_columns = self.prepare_sort_colors(sheet, &slots, &color_keys)?.into_iter();
        let prepared: Vec<_> = keys.iter().map(|key| match key {
            SortCriterion::Value(key) => PreparedColumn::Value(key, slots.iter().map(|&row|
                collapse_array_for_eval(target.peek_value(CellAddress::new(row, key.col)))).collect()),
            SortCriterion::Color(key) => PreparedColumn::Color(*key,
                color_columns.next().expect("one prepared column per color key")),
        }).collect();
        target.store.settle_pending_reads();

        let target = self.sheet_mut(sheet).ok_or(SortRangeError::InvalidRange)?;
        Ok(target.apply_sort_order(range, &slots, |a, b| {
            prepared.iter().map(|key| key.compare(a, b))
                .find(|order| *order != Ordering::Equal).unwrap_or(Ordering::Equal)
        }))
    }
}
