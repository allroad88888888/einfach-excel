//! Sparse worksheet defaults; individual row/column/cell styles still take precedence.
use super::*;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SheetDefaults {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub row_height: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub col_width: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_size: Option<u32>,
}
impl SheetDefaults {
    pub fn is_empty(&self) -> bool { *self == Self::default() }
    pub fn validate(&self) -> Result<(), &'static str> {
        if self.row_height.is_some_and(|n| !(16..=512).contains(&n))
            || self.col_width.is_some_and(|n| !(40..=1024).contains(&n))
            || self.font_size.is_some_and(|n| !(1..=512).contains(&n)) {
            return Err("Use rowHeight 16–512 px, colWidth 40–1024 px and fontSize 1–512 px.");
        }
        Ok(())
    }
}
impl Sheet {
    pub fn defaults(&self) -> SheetDefaults { self.defaults }
    /// Used during definition import and snapshot restore, before a workbook becomes interactive.
    pub fn set_defaults(&mut self, defaults: SheetDefaults) -> Result<(), &'static str> {
        defaults.validate()?;
        self.defaults = defaults;
        Ok(())
    }
}
