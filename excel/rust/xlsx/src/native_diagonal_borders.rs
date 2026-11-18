//! Reject native inputs that a single SpreadsheetML diagonal element cannot represent.
use crate::native::Borders;
use serde::{de::Error, Deserialize, Deserializer};

pub fn deserialize<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Option<Borders>, D::Error> {
    let value = Option::<Borders>::deserialize(deserializer)?;
    if let Some(borders) = &value {
        for spec in [&borders.diag_up, &borders.diag_down].into_iter().flatten() {
            if !matches!(spec.style.as_str(), "none" | "thin" | "medium" | "thick"
                | "dashed" | "dotted" | "double") {
                return Err(D::Error::custom("invalid diagonal border style"));
            }
            if spec.color.as_ref().is_some_and(|color| color.len() != 7
                || !color.starts_with('#') || !color.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit)) {
                return Err(D::Error::custom("diagonal border color must be #RRGGBB"));
            }
        }
        if let (Some(up), Some(down)) = (&borders.diag_up, &borders.diag_down) {
            if up.style != "none" && down.style != "none" && (up.style != down.style
                || !up.color.as_deref().unwrap_or("#000000")
                    .eq_ignore_ascii_case(down.color.as_deref().unwrap_or("#000000"))) {
                return Err(D::Error::custom("both diagonal borders must share a style and color"));
            }
        }
    }
    Ok(value)
}
