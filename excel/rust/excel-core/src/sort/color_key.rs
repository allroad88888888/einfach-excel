//! Color targets for a stable native sort, computed before row relocation.

use std::cmp::Ordering;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SortColorSource {
    Fill,
    Font,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SortColorPosition {
    Top,
    Bottom,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DisplaySortColor {
    Automatic,
    Opaque(u32),
    Other,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SortColorKey {
    pub col: u32,
    pub source: SortColorSource,
    pub position: SortColorPosition,
    target: DisplaySortColor,
}

impl SortColorKey {
    pub fn new(
        col: u32,
        source: SortColorSource,
        color: Option<&str>,
        position: SortColorPosition,
    ) -> Result<Self, &'static str> {
        let target = match color {
            None => DisplaySortColor::Automatic,
            Some(color) => {
                let hex = color.strip_prefix('#').filter(|hex| hex.len() == 6)
                    .ok_or("Sort colors must use #RRGGBB.")?;
                if !hex.bytes().all(|byte| byte.is_ascii_hexdigit()) {
                    return Err("Sort colors must use #RRGGBB.");
                }
                DisplaySortColor::Opaque(
                    u32::from_str_radix(hex, 16).map_err(|_| "Sort colors must use #RRGGBB.")?,
                )
            }
        };
        Ok(Self { col, source, position, target })
    }

    pub(super) fn matches(self, displayed: DisplaySortColor) -> bool {
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
