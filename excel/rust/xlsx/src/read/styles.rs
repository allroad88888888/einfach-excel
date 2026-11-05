//! `styles.xml` → 每个 cellXfs 索引对应的原生单元格格式。与默认字体相同的属性不写，
//! 这样未改样式的格子在原生快照里保持无格式。

use std::collections::HashMap;

use quick_xml::events::{BytesStart, Event};
use quick_xml::Reader;

use super::xml::{attr, attr_bool, attr_f64, attr_u32, local_name};
use crate::color;
use crate::native::{BorderSide, Borders, CellFormat};
use crate::number_format;
use crate::XlsxError;

#[derive(Default, Clone, PartialEq)]
struct Font {
    bold: bool,
    italic: bool,
    underline: bool,
    strike: bool,
    size: Option<f64>,
    name: Option<String>,
    color: Option<String>,
}

#[derive(Default)]
struct Parsed {
    num_fmts: HashMap<u32, String>,
    fonts: Vec<Font>,
    fills: Vec<Option<String>>,
    borders: Vec<Borders>,
    xfs: Vec<CellFormat>,
}

enum Section { None, Font, Fill, Border(Option<&'static str>), CellXfs, Other }

fn color_of(e: &BytesStart, theme: &[String]) -> Option<String> {
    if let Some(rgb) = attr(e, "rgb") {
        return color::from_argb(&rgb);
    }
    let tint = attr_f64(e, "tint").unwrap_or(0.0);
    if let Some(index) = attr_u32(e, "theme") {
        return color::from_theme(theme, index as usize, tint);
    }
    attr_u32(e, "indexed").and_then(|index| color::from_indexed(index as usize))
}

fn border_style(style: &str) -> Option<&'static str> {
    Some(match style {
        "thin" | "hair" => "thin",
        "medium" => "medium",
        "thick" => "thick",
        "dashed" | "mediumDashed" | "dashDot" | "mediumDashDot" | "dashDotDot" |
        "mediumDashDotDot" | "slantDashDot" => "dashed",
        "dotted" => "dotted",
        "double" => "double",
        _ => return None,
    })
}

fn set_side(borders: &mut Borders, side: &str, value: BorderSide) {
    match side {
        "top" => borders.top = Some(value),
        "bottom" => borders.bottom = Some(value),
        "left" | "start" => borders.left = Some(value),
        "right" | "end" => borders.right = Some(value),
        _ => {}
    }
}

fn side_mut<'a>(borders: &'a mut Borders, side: &str) -> Option<&'a mut BorderSide> {
    match side {
        "top" => borders.top.as_mut(),
        "bottom" => borders.bottom.as_mut(),
        "left" | "start" => borders.left.as_mut(),
        "right" | "end" => borders.right.as_mut(),
        _ => None,
    }
}

fn xf_format(e: &BytesStart, parsed: &Parsed) -> CellFormat {
    let mut format = CellFormat::default();
    let num_fmt = attr_u32(e, "numFmtId").unwrap_or(0);
    if num_fmt != 0 {
        let code = parsed.num_fmts.get(&num_fmt).map(String::as_str)
            .or_else(|| number_format::builtin_code(num_fmt));
        if let Some(code) = code {
            format.number_format = Some(number_format::from_code(code));
        }
    }
    let default_font = parsed.fonts.first().cloned().unwrap_or_default();
    if let Some(font) = parsed.fonts.get(attr_u32(e, "fontId").unwrap_or(0) as usize) {
        if font.bold { format.bold = Some(true); }
        if font.italic { format.italic = Some(true); }
        if font.underline { format.underline = Some(true); }
        if font.strike { format.strikethrough = Some(true); }
        if font.size != default_font.size {
            format.font_size = font.size.map(|size| size.round() as u32);
        }
        if font.name != default_font.name { format.font_family = font.name.clone(); }
        if font.color != default_font.color { format.fg_color = font.color.clone(); }
    }
    format.bg_color = parsed.fills.get(attr_u32(e, "fillId").unwrap_or(0) as usize).cloned().flatten();
    let borders = parsed.borders.get(attr_u32(e, "borderId").unwrap_or(0) as usize).cloned()
        .unwrap_or_default();
    if borders != Borders::default() {
        format.borders = Some(borders);
    }
    format
}

fn alignment(e: &BytesStart, format: &mut CellFormat) {
    format.align = match attr(e, "horizontal").as_deref() {
        Some("left") => Some("left".into()),
        Some("center") => Some("center".into()),
        Some("centerContinuous") => Some("centerAcross".into()),
        Some("right") => Some("right".into()),
        _ => None,
    };
    format.vertical_align = match attr(e, "vertical").as_deref() {
        Some("top") => Some("top".into()),
        Some("center") => Some("center".into()),
        Some("justify") => Some("justify".into()),
        Some("distributed") => Some("distributed".into()),
        // bottom 是 Excel 默认，与引擎默认一致，不必写。
        _ => None,
    };
    if attr_bool(e, "wrapText", false) {
        format.wrap = Some(true);
    }
    format.indent = attr_u32(e, "indent").filter(|&n| n > 0).map(|n| n.min(15) as u8);
}

pub fn parse(xml: Option<&str>, theme: &[String]) -> Result<Vec<CellFormat>, XlsxError> {
    let Some(xml) = xml else { return Ok(Vec::new()) };
    let mut parsed = Parsed::default();
    let mut section = Section::None;
    let mut reader = Reader::from_str(xml);
    loop {
        let event = reader.read_event()
            .map_err(|_| XlsxError::new("xl/styles.xml is not well-formed XML."))?;
        let (e, empty) = match &event {
            Event::Start(e) => (e.clone(), false),
            Event::Empty(e) => (e.clone(), true),
            Event::End(e) => {
                match e.local_name().as_ref() {
                    b"font" | b"fill" | b"border" | b"cellXfs" | b"cellStyleXfs" | b"dxfs" | b"cellStyles" => {
                        section = Section::None
                    }
                    b"left" | b"right" | b"top" | b"bottom" | b"start" | b"end" => {
                        if let Section::Border(_) = section { section = Section::Border(None) }
                    }
                    _ => {}
                }
                continue;
            }
            Event::Eof => break,
            _ => continue,
        };
        let name = local_name(&e);
        match (name.as_slice(), &mut section) {
            (b"cellStyleXfs" | b"dxfs" | b"cellStyles", _) => section = Section::Other,
            (_, Section::Other) => {}
            (b"numFmt", _) => {
                if let (Some(id), Some(code)) = (attr_u32(&e, "numFmtId"), attr(&e, "formatCode")) {
                    parsed.num_fmts.insert(id, code);
                }
            }
            (b"font", _) => {
                parsed.fonts.push(Font::default());
                section = if empty { Section::None } else { Section::Font };
            }
            (b"fill", _) => {
                parsed.fills.push(None);
                section = if empty { Section::None } else { Section::Fill };
            }
            (b"border", _) => {
                parsed.borders.push(Borders::default());
                section = if empty { Section::None } else { Section::Border(None) };
            }
            (b"cellXfs", _) => section = Section::CellXfs,
            (b"xf", Section::CellXfs) => parsed.xfs.push(xf_format(&e, &parsed)),
            (b"alignment", Section::CellXfs) => {
                if let Some(format) = parsed.xfs.last_mut() { alignment(&e, format) }
            }
            (tag, Section::Font) => {
                let font = parsed.fonts.last_mut().expect("font pushed");
                match tag {
                    b"b" => font.bold = attr_bool(&e, "val", true),
                    b"i" => font.italic = attr_bool(&e, "val", true),
                    b"strike" => font.strike = attr_bool(&e, "val", true),
                    b"u" => font.underline = attr(&e, "val").as_deref() != Some("none"),
                    b"sz" => font.size = attr_f64(&e, "val"),
                    b"name" => font.name = attr(&e, "val"),
                    b"color" => font.color = color_of(&e, theme),
                    _ => {}
                }
            }
            (b"patternFill", Section::Fill) => {
                if attr(&e, "patternType").as_deref().is_none_or(|kind| kind == "none") {
                    // 无图案填充：本 fill 没有背景色，等 </fill> 再回到顶层。
                    section = Section::Other;
                }
            }
            (b"fgColor", Section::Fill) => {
                if let Some(fill) = parsed.fills.last_mut() { *fill = color_of(&e, theme) }
            }
            (side @ (b"left" | b"right" | b"top" | b"bottom" | b"start" | b"end"), Section::Border(_)) => {
                let side = std::str::from_utf8(side).unwrap_or_default();
                if let Some(style) = attr(&e, "style").as_deref().and_then(border_style) {
                    let borders = parsed.borders.last_mut().expect("border pushed");
                    set_side(borders, side, BorderSide { style: style.into(), color: None });
                    section = Section::Border(Some(match side {
                        "top" => "top", "bottom" => "bottom", "left" | "start" => "left", _ => "right",
                    }));
                }
            }
            (b"color", Section::Border(Some(side))) => {
                let side = *side;
                if let Some(value) = parsed.borders.last_mut().and_then(|b| side_mut(b, side)) {
                    value.color = color_of(&e, theme);
                }
            }
            _ => {}
        }
    }
    Ok(parsed.xfs)
}

/// Actual font size for each XF, including a font equal to the workbook's default font.
/// Per-sheet default column styles must distinguish an explicit 11pt override from inheritance.
pub fn font_sizes(xml: Option<&str>) -> Vec<Option<u32>> {
    let Some(root) = xml.and_then(|xml| super::dom::parse(xml, &[])) else { return Vec::new() };
    let Some(fonts) = root.child("fonts") else { return Vec::new() };
    let Some(xfs) = root.child("cellXfs") else { return Vec::new() };
    xfs.each("xf").map(|xf| {
        fonts.each("font").nth(xf.attr_u32("fontId").unwrap_or(0) as usize)?
            .child("sz")?.attr_f64("val")
            .filter(|n| n.is_finite() && *n >= 8.0 && *n <= 72.0)
            .map(|n| n.round() as u32)
    }).collect()
}
