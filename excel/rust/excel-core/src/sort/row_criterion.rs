//! Row keys for column sorting, sharing the existing comparison options.

use std::sync::Arc;

use crate::sort_custom_list::CustomList;
use crate::IconSet;

use super::{SortColorKey, SortColorPosition, SortColorSource, SortCriterion,
    SortDirection, SortIconKey, SortKey};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RowSortCriterion(SortCriterion);

impl RowSortCriterion {
    pub fn value(
        row: u32,
        direction: SortDirection,
        case_sensitive: bool,
        empty_first: bool,
        custom_list: Option<Arc<CustomList>>,
    ) -> Self {
        Self(SortCriterion::Value(SortKey {
            col: row, direction, case_sensitive, empty_first, custom_list,
        }))
    }

    pub fn color(
        row: u32,
        source: SortColorSource,
        color: Option<&str>,
        position: SortColorPosition,
    ) -> Result<Self, &'static str> {
        SortColorKey::new(row, source, color, position).map(|key| Self(SortCriterion::Color(key)))
    }

    pub fn icon(
        row: u32,
        icon: Option<(IconSet, u8)>,
        position: SortColorPosition,
    ) -> Result<Self, &'static str> {
        SortIconKey::new(row, icon, position).map(|key| Self(SortCriterion::Icon(key)))
    }

    pub(super) fn criterion(&self) -> &SortCriterion {
        &self.0
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ColumnSortReport {
    pub moved_columns: u32,
    pub moved_cells: u32,
    /// Changed positions as (destination column, original column).
    pub column_permutation: Vec<(u32, u32)>,
}
