//! A sortable criterion derived from the pre-move display snapshot.

use std::cmp::Ordering;

use super::color_key::SortColorKey;
use super::icon_key::SortIconKey;

#[derive(Clone, Copy)]
pub(super) enum SortAppearanceKey {
    Color(SortColorKey),
    Icon(SortIconKey),
}

impl SortAppearanceKey {
    pub(super) fn column(self) -> u32 {
        match self {
            Self::Color(key) => key.col,
            Self::Icon(key) => key.col,
        }
    }

    pub(super) fn compare(self, a: bool, b: bool) -> Ordering {
        match self {
            Self::Color(key) => key.compare(a, b),
            Self::Icon(key) => key.compare(a, b),
        }
    }
}
