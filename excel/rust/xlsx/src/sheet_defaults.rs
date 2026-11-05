//! Native defaults shared by import/export; OOXML column styles carry a sheet-specific font size.
use serde::{Deserialize, Serialize};
#[derive(Debug, Default, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SheetDefaults {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub row_height: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub col_width: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_size: Option<u32>,
}
impl SheetDefaults {
    pub fn is_empty(&self) -> bool {
        self.row_height.is_none() && self.col_width.is_none() && self.font_size.is_none()
    }
}
