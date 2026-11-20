//! Sort criteria refer to the displayed icon identity, including reversed sets.

use std::cmp::Ordering;

use crate::{ConditionalIconDisplay, IconSet};

use super::SortColorPosition;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SortIconKey {
    pub col: u32,
    pub position: SortColorPosition,
    target: Option<(IconSet, u8)>,
}

impl SortIconKey {
    pub fn new(
        col: u32,
        target: Option<(IconSet, u8)>,
        position: SortColorPosition,
    ) -> Result<Self, &'static str> {
        if target.is_some_and(|(_, index)| index > 2) {
            return Err("Choose a valid displayed icon.");
        }
        Ok(Self { col, position, target })
    }

    pub(super) fn matches(self, displayed: Option<&ConditionalIconDisplay>) -> bool {
        displayed.map(|icon| (icon.set, icon.index)) == self.target
    }

    pub(super) fn compare(self, left: bool, right: bool) -> Ordering {
        self.position.compare_match(left, right)
    }
}
