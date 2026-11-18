//! Serialize one native fill without interpreting its foreground as the base color.
use crate::{color::to_argb, native::CellFormat, native_fill::CellFill};

pub fn xml(format: &CellFormat) -> Option<String> {
    let background = format.bg_color.as_ref().and_then(|color| color.as_deref()).and_then(to_argb);
    match format.fill.as_ref().and_then(Option::as_ref) {
        Some(CellFill::Pattern { pattern, foreground }) => Some(format!(
            r#"<fill><patternFill patternType="{}"><fgColor rgb="{}"/><bgColor rgb="{}"/></patternFill></fill>"#,
            pattern.xml(), to_argb(foreground).expect("validated foreground"),
            background.unwrap_or_else(|| "FFFFFFFF".into()))),
        None => background.map(|argb| format!(
            r#"<fill><patternFill patternType="solid"><fgColor rgb="{argb}"/><bgColor indexed="64"/></patternFill></fill>"#)),
    }
}
