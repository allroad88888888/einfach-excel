//! Resolve displayed colors from the native style layers used by the grid.

use crate::cell_style::CellStyle;
use crate::format::NumberFormat;
use einfach_core::Value;

use crate::rich_text::RichTextRun;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DisplayColorSource {
    Fill,
    Font,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) enum DisplayColor {
    Automatic,
    Opaque(u32),
    Other,
}

pub(crate) const AUTOMATIC_COLOR: &str = "automatic";

impl DisplayColor {
    pub(crate) fn selection_value(self) -> Option<String> {
        match self {
            Self::Automatic => Some(AUTOMATIC_COLOR.into()),
            Self::Opaque(rgb) => Some(format!("#{rgb:06x}")),
            Self::Other => None,
        }
    }
}

pub(crate) fn parse_color_target(color: Option<&str>) -> Result<DisplayColor, &'static str> {
    match color {
        None => Ok(DisplayColor::Automatic),
        Some(color) => {
            let hex = color.strip_prefix('#').filter(|hex| hex.len() == 6)
                .ok_or("Colors must use #RRGGBB.")?;
            if !hex.bytes().all(|byte| byte.is_ascii_hexdigit()) {
                return Err("Colors must use #RRGGBB.");
            }
            u32::from_str_radix(hex, 16).map(DisplayColor::Opaque)
                .map_err(|_| "Colors must use #RRGGBB.")
        }
    }
}

/// Styles are ordered from most specific (cell) to least specific (column).
/// A present empty value stops inheritance even if a lower layer has a color.
pub(crate) fn effective_color(
    layers: [Option<&CellStyle>; 3],
    source: DisplayColorSource,
    has_conditional_font: bool,
    value: impl FnOnce() -> Value,
) -> DisplayColor {
    if source == DisplayColorSource::Fill {
        let fill = layers.into_iter().flatten().find_map(|style| style.fill.as_ref());
        if fill.is_some_and(Option::is_some) {
            return DisplayColor::Other;
        }
        return base_color(layers.into_iter().flatten()
            .find_map(|style| style.background.as_ref()).and_then(Option::as_deref));
    }

    if !has_conditional_font {
        let number_format = layers.into_iter().flatten().find_map(|style| style.number_format.as_ref());
        if let Some(NumberFormat::Custom(pattern)) = number_format {
            let formatted = match value() {
                Value::Number(number) => crate::custom_number_format::format_number(pattern, number),
                Value::Text(text) => crate::custom_number_format::format_text(pattern, &text),
                _ => None,
            };
            if let Some(color) = formatted.and_then(|part| part.color) {
                return base_color(Some(&color));
            }
        }
    }
    base_color(layers.into_iter().flatten()
        .find_map(|style| style.color.as_ref()).and_then(Option::as_deref))
}

/// Explicit rich text run colors override inheritance. A nonempty inherited run
/// uses the cell font. Filtering may match any rendered run, while sorting is cell-level.
pub(crate) fn visit_font_colors(
    cell: DisplayColor,
    runs: Option<&[RichTextRun]>,
    mut visit: impl FnMut(DisplayColor),
) {
    let Some(runs) = runs.filter(|runs| !runs.is_empty()) else {
        visit(cell);
        return;
    };
    let mut visited = false;
    for run in runs.iter().filter(|run| !run.text.is_empty()) {
        visited = true;
        visit(run.format.color.as_deref().map_or(cell, |color| base_color(Some(color))));
    }
    if !visited {
        visit(cell);
    }
}

fn base_color(color: Option<&str>) -> DisplayColor {
    match color {
        None => DisplayColor::Automatic,
        Some(color) => opaque_rgb(color).map_or(DisplayColor::Other, DisplayColor::Opaque),
    }
}

fn opaque_rgb(color: &str) -> Option<u32> {
    let color = color.trim().to_ascii_lowercase();
    if let Some(hex) = color.strip_prefix('#') {
        let plain = match hex.len() {
            3 | 6 => hex,
            4 => hex.strip_suffix('f')?,
            8 => hex.strip_suffix("ff")?,
            _ => return None,
        };
        if !plain.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return None;
        }
        let channels = u32::from_str_radix(plain, 16).ok()?;
        return Some(if plain.len() == 3 {
            ((channels >> 8) * 17 << 16) | (((channels >> 4) & 15) * 17 << 8) | ((channels & 15) * 17)
        } else {
            channels
        });
    }
    if let Some((kind, components)) = color.strip_suffix(')').and_then(|color| color.split_once('(')) {
        if kind == "rgba" || kind == "rgb" {
            let mut components = components.split(',').map(str::trim);
            let mut rgb = 0u32;
            for _ in 0..3 {
                let channel = components.next()?;
                if channel.is_empty() || channel.len() > 3 || !channel.bytes().all(|b| b.is_ascii_digit()) {
                    return None;
                }
                rgb = (rgb << 8) | u32::from(channel.parse::<u8>().ok()?);
            }
            if kind == "rgba" {
                let alpha = components.next()?;
                if alpha != "1" && !alpha.strip_prefix("1.").is_some_and(|v|
                    !v.is_empty() && v.bytes().all(|byte| byte == b'0')) {
                    return None;
                }
            }
            return components.next().is_none().then_some(rgb);
        }
    }
    Some(match color.as_str() {
        "aqua" | "cyan" => 0x00ffff,
        "black" => 0x000000,
        "blue" => 0x0000ff,
        "fuchsia" | "magenta" => 0xff00ff,
        "gray" | "grey" => 0x808080,
        "green" => 0x008000,
        "lime" => 0x00ff00,
        "maroon" => 0x800000,
        "navy" => 0x000080,
        "olive" => 0x808000,
        "orange" => 0xffa500,
        "purple" => 0x800080,
        "red" => 0xff0000,
        "silver" => 0xc0c0c0,
        "teal" => 0x008080,
        "white" => 0xffffff,
        "yellow" => 0xffff00,
        _ => return None,
    })
}
