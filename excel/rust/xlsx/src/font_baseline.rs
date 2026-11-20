//! Native baseline vocabulary and its OOXML font/rPr representation.
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FontBaseline { Normal, Superscript, Subscript }

impl FontBaseline {
    pub fn from_xml(value: &str) -> Option<Self> {
        match value {
            "baseline" => Some(Self::Normal),
            "superscript" => Some(Self::Superscript),
            "subscript" => Some(Self::Subscript),
            _ => None,
        }
    }

    pub fn xml(self) -> &'static str {
        match self {
            Self::Normal => "baseline",
            Self::Superscript => "superscript",
            Self::Subscript => "subscript",
        }
    }
}
