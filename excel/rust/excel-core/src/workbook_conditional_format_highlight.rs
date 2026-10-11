//! 所有原生条件规则共用的高亮补丁校验；不允许行高、列宽等布局属性。
use crate::cell_style::CellStyle;
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Highlight {
    #[serde(rename = "fgColor", alias = "color")]
    color: Option<String>,
    #[serde(rename = "bgColor", alias = "background")]
    background: Option<String>,
    bold: Option<bool>,
    italic: Option<bool>,
    underline: Option<bool>,
}

pub(super) fn enabled_by_default() -> bool {
    true
}

pub(super) fn parse_color(color: &str) -> Result<[u8; 3], &'static str> {
    if color.len() != 7 || !color.starts_with('#')
        || !color[1..].bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("Highlight colors must use #RRGGBB.");
    }
    Ok([1, 3, 5].map(|start| u8::from_str_radix(&color[start..start + 2], 16).unwrap()))
}

impl Highlight {
    pub(super) fn into_style(self) -> Result<CellStyle, &'static str> {
        for color in [&self.color, &self.background].into_iter().flatten() {
            parse_color(color)?;
        }
        let style = CellStyle {
            color: self.color.map(Some),
            background: self.background.map(Some),
            bold: self.bold,
            italic: self.italic,
            underline: self.underline,
            ..CellStyle::default()
        };
        if style.is_empty() {
            return Err("Choose at least one highlight property.");
        }
        Ok(style)
    }
}
