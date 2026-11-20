//! A selectable color target for a native filter condition.

use crate::display_color::{parse_color_target, DisplayColor, AUTOMATIC_COLOR};
use serde::{Deserialize, Serialize};

pub use crate::display_color::DisplayColorSource as FilterColorSource;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct FilterColorTarget(DisplayColor);

impl FilterColorTarget {
    pub fn new(value: Option<&str>) -> Result<Self, &'static str> {
        parse_color_target(value).map(Self)
    }

    pub(crate) fn matches(self, color: DisplayColor) -> bool {
        self.0 == color
    }
}

impl Serialize for FilterColorTarget {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let value = self.0.selection_value()
            .ok_or_else(|| serde::ser::Error::custom("Expected a selectable color."))?;
        serializer.serialize_str(&value)
    }
}

impl<'de> Deserialize<'de> for FilterColorTarget {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let value = String::deserialize(deserializer)?;
        Self::new((value != AUTOMATIC_COLOR).then_some(value.as_str()))
            .map_err(serde::de::Error::custom)
    }
}
