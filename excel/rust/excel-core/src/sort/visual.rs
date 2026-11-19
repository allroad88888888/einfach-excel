//! Evaluate mixed value, color and icon criteria before placing records.

use std::cmp::Ordering;

use einfach_core::Value;

use crate::sheet::collapse_array_for_eval;
use crate::{CellRange, Workbook};

use super::appearance_key::SortAppearanceKey;
use super::axis::SortAxis;
use super::color_key::SortColorKey;
use super::compare::compare_key_values;
use super::icon_key::SortIconKey;
use super::reorder::SlotPermutation;
use super::row_criterion::{ColumnSortReport, RowSortCriterion};
use super::{SortKey, SortRangeError, SortRangeReport};

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SortCriterion {
    Value(SortKey),
    Color(SortColorKey),
    Icon(SortIconKey),
}

impl SortCriterion {
    fn key_index(&self) -> u32 {
        match self {
            Self::Value(key) => key.col,
            Self::Color(key) => key.col,
            Self::Icon(key) => key.col,
        }
    }

    fn appearance(&self) -> Option<SortAppearanceKey> {
        match self {
            Self::Value(_) => None,
            Self::Color(color) => Some(SortAppearanceKey::Color(*color)),
            Self::Icon(icon) => Some(SortAppearanceKey::Icon(*icon)),
        }
    }
}

enum PreparedKey<'a> {
    Value(&'a SortKey, Vec<Value>),
    Appearance(SortAppearanceKey, Vec<bool>),
}

impl PreparedKey<'_> {
    fn compare(&self, a: usize, b: usize) -> Ordering {
        match self {
            Self::Value(key, values) => compare_key_values(key, &values[a], &values[b]),
            Self::Appearance(key, matches) => key.compare(matches[a], matches[b]),
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
        let slots = target.sort_slots(range, keys.iter().map(SortCriterion::key_index), excluded_rows)?;
        let result = self.sort_prepared_slots(sheet, range, SortAxis::Rows, &slots, keys.iter())?;
        Ok(SortRangeReport {
            moved_rows: result.changed_slots.len() as u32,
            moved_cells: result.moved_cells,
            row_permutation: result.changed_slots,
        })
    }

    pub fn sort_columns_by_criteria(
        &mut self,
        sheet: usize,
        range: CellRange,
        keys: &[RowSortCriterion],
    ) -> Result<ColumnSortReport, SortRangeError> {
        let range = range.normalize();
        if self.sheet(sheet).is_none() {
            return Err(SortRangeError::InvalidRange);
        }
        self.ensure_range_editable(sheet, range).map_err(|_| SortRangeError::ProtectedRange)?;
        let keys = keys.iter().map(RowSortCriterion::criterion);
        let slots = self.sort_column_slots(sheet, range, keys.clone().map(SortCriterion::key_index))?;
        let result = self.sort_prepared_slots(sheet, range, SortAxis::Columns, &slots, keys)?;
        Ok(ColumnSortReport {
            moved_columns: result.changed_slots.len() as u32,
            moved_cells: result.moved_cells,
            column_permutation: result.changed_slots,
        })
    }

    fn sort_prepared_slots<'a>(
        &mut self,
        sheet: usize,
        range: CellRange,
        axis: SortAxis,
        slots: &[u32],
        keys: impl Iterator<Item = &'a SortCriterion> + Clone,
    ) -> Result<SlotPermutation, SortRangeError> {
        if slots.len() <= 1 {
            return Ok(SlotPermutation::default());
        }
        let target = self.sheet(sheet).ok_or(SortRangeError::InvalidRange)?;
        let appearance: Vec<_> = keys.clone().filter_map(|key| {
            key.appearance().map(|appearance| (key.key_index(), appearance))
        }).collect();
        let mut matches = self.prepare_sort_appearance(sheet, axis, slots, &appearance)?.into_iter();
        let prepared: Vec<_> = keys.map(|key| match key {
            SortCriterion::Value(key) => PreparedKey::Value(key, slots.iter().map(|&slot| {
                collapse_array_for_eval(target.peek_value(axis.address(slot, key.col)))
            }).collect()),
            criterion => PreparedKey::Appearance(criterion.appearance().expect("appearance criterion"),
                matches.next().expect("one vector per appearance criterion")),
        }).collect();
        target.store.settle_pending_reads();

        let target = self.sheet_mut(sheet).ok_or(SortRangeError::InvalidRange)?;
        Ok(target.apply_slot_permutation(range, slots, axis, |a, b| {
            prepared.iter().map(|key| key.compare(a, b))
                .find(|order| *order != Ordering::Equal).unwrap_or(Ordering::Equal)
        }))
    }
}
