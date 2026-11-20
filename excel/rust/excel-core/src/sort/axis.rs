//! Translate between a sort's record slot and its absolute key coordinate.

use crate::{CellAddress, CellRange};
use std::ops::RangeInclusive;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum SortAxis {
    Rows,
    Columns,
}

impl SortAxis {
    pub(super) fn slot(self, address: CellAddress) -> u32 {
        match self {
            Self::Rows => address.row,
            Self::Columns => address.col,
        }
    }

    pub(super) fn key(self, address: CellAddress) -> u32 {
        match self {
            Self::Rows => address.col,
            Self::Columns => address.row,
        }
    }

    pub(super) fn address(self, slot: u32, key: u32) -> CellAddress {
        match self {
            Self::Rows => CellAddress::new(slot, key),
            Self::Columns => CellAddress::new(key, slot),
        }
    }

    pub(super) fn slots(self, range: CellRange) -> RangeInclusive<u32> {
        self.slot(range.start)..=self.slot(range.end)
    }

    pub(super) fn keys(self, range: CellRange) -> RangeInclusive<u32> {
        self.key(range.start)..=self.key(range.end)
    }
}
