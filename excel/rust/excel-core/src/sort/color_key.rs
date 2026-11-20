//! Color targets for a stable native sort, computed before row relocation.

use std::cmp::Ordering;

use crate::display_color::{parse_color_target, DisplayColor};

pub use crate::display_color::DisplayColorSource as SortColorSource;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SortColorPosition {
    Top,
    Bottom,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SortColorKey {
    pub col: u32,
    pub source: SortColorSource,
    pub position: SortColorPosition,
    target: DisplayColor,
}

impl SortColorKey {
    pub fn new(
        col: u32,
        source: SortColorSource,
        color: Option<&str>,
        position: SortColorPosition,
    ) -> Result<Self, &'static str> {
        let target = parse_color_target(color).map_err(|_| "Sort colors must use #RRGGBB.")?;
        Ok(Self { col, source, position, target })
    }

    pub(super) fn matches(self, displayed: DisplayColor) -> bool {
        self.target == displayed
    }

    pub(super) fn compare(self, left_matches: bool, right_matches: bool) -> Ordering {
        self.position.compare_match(left_matches, right_matches)
    }
}

impl SortColorPosition {
    pub(super) fn compare_match(self, left_matches: bool, right_matches: bool) -> Ordering {
        match self {
            Self::Top => right_matches.cmp(&left_matches),
            Self::Bottom => left_matches.cmp(&right_matches),
        }
    }
}
