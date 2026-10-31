//! 把原生单元格格式去重成 XLSX 的 fonts / fills / borders / numFmts / cellXfs。

use crate::color::to_argb;
use crate::native::{BorderSide, Borders, CellFormat};
use crate::number_format;

use super::xml::escape;

const DEFAULT_FONT: &str = r#"<font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>"#;
const FIRST_CUSTOM_NUM_FMT: u32 = 164;

/// 索引 0 是默认格式；`xf(format)` 返回 cellXfs 下标。
pub struct StyleTable {
    xfs: Vec<String>,
    fonts: Vec<String>,
    fills: Vec<String>,
    borders: Vec<String>,
    num_fmts: Vec<(u32, String)>,
    seen: Vec<(CellFormat, u32)>,
    dxfs: Vec<String>,
}

impl StyleTable {
    pub fn new() -> Self {
        Self {
            xfs: vec![r#"<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>"#.into()],
            fonts: vec![DEFAULT_FONT.into()],
            fills: vec![
                r#"<fill><patternFill patternType="none"/></fill>"#.into(),
                r#"<fill><patternFill patternType="gray125"/></fill>"#.into(),
            ],
            borders: vec!["<border><left/><right/><top/><bottom/><diagonal/></border>".into()],
            num_fmts: Vec::new(),
            seen: Vec::new(),
            dxfs: Vec::new(),
        }
    }

    pub fn xf(&mut self, format: &CellFormat) -> u32 {
        if *format == CellFormat::default() {
            return 0;
        }
        if let Some((_, index)) = self.seen.iter().find(|(seen, _)| seen == format) {
            return *index;
        }
        let num_fmt = format.number_format.as_ref().map_or(0, |nf| self.num_fmt(&number_format::to_code(nf)));
        let font = intern(&mut self.fonts, font_xml(format));
        let fill = match format.bg_color.as_deref().and_then(to_argb) {
            Some(argb) => intern(&mut self.fills, format!(
                r#"<fill><patternFill patternType="solid"><fgColor rgb="{argb}"/><bgColor indexed="64"/></patternFill></fill>"#)),
            None => 0,
        };
        let border = match &format.borders {
            Some(borders) if *borders != Borders::default() => intern(&mut self.borders, border_xml(borders)),
            _ => 0,
        };
        let alignment = alignment_xml(format);
        let mut xf = format!(r#"<xf numFmtId="{num_fmt}" fontId="{font}" fillId="{fill}" borderId="{border}" xfId="0""#);
        for (flag, used) in [("applyNumberFormat", num_fmt != 0), ("applyFont", font != 0),
            ("applyFill", fill != 0), ("applyBorder", border != 0), ("applyAlignment", alignment.is_some())] {
            if used {
                xf.push_str(&format!(r#" {flag}="1""#));
            }
        }
        match alignment {
            Some(alignment) => xf.push_str(&format!(">{alignment}</xf>")),
            None => xf.push_str("/>"),
        }
        let index = intern(&mut self.xfs, xf);
        self.seen.push((format.clone(), index));
        index
    }

    fn num_fmt(&mut self, code: &str) -> u32 {
        if let Some(id) = number_format::builtin_id(code) {
            return id;
        }
        if let Some((id, _)) = self.num_fmts.iter().find(|(_, c)| c == code) {
            return *id;
        }
        let id = FIRST_CUSTOM_NUM_FMT + self.num_fmts.len() as u32;
        self.num_fmts.push((id, code.to_string()));
        id
    }

    /// 条件格式用的差异样式（`<dxfs>` 下标）；原生高亮没有任何可写属性时返回 None。
    pub fn dxf(&mut self, highlight: &serde_json::Value) -> Option<u32> {
        let xml = super::dxf::xml(highlight)?;
        Some(intern(&mut self.dxfs, xml))
    }

    pub fn into_xml(self) -> String {
        let section = |name: &str, items: &[String]| {
            format!(r#"<{name} count="{}">{}</{name}>"#, items.len(), items.concat())
        };
        let num_fmts = if self.num_fmts.is_empty() {
            String::new()
        } else {
            let items: Vec<String> = self.num_fmts.iter()
                .map(|(id, code)| format!(r#"<numFmt numFmtId="{id}" formatCode="{}"/>"#, escape(code)))
                .collect();
            section("numFmts", &items)
        };
        format!(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">{num_fmts}{}{}{}<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>{}<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>{}</styleSheet>"#,
            section("fonts", &self.fonts), section("fills", &self.fills),
            section("borders", &self.borders), section("cellXfs", &self.xfs),
            if self.dxfs.is_empty() { String::new() } else { section("dxfs", &self.dxfs) },
        )
    }
}

fn intern(items: &mut Vec<String>, xml: String) -> u32 {
    match items.iter().position(|item| *item == xml) {
        Some(index) => index as u32,
        None => {
            items.push(xml);
            (items.len() - 1) as u32
        }
    }
}

fn font_xml(format: &CellFormat) -> String {
    let mut xml = String::from("<font>");
    for (flag, tag) in [(format.bold, "<b/>"), (format.italic, "<i/>"),
        (format.strikethrough, "<strike/>"), (format.underline, "<u/>")] {
        if flag == Some(true) {
            xml.push_str(tag);
        }
    }
    xml.push_str(&format!(r#"<sz val="{}"/>"#, format.font_size.unwrap_or(11)));
    match format.fg_color.as_deref().and_then(to_argb) {
        Some(argb) => xml.push_str(&format!(r#"<color rgb="{argb}"/>"#)),
        None => xml.push_str(r#"<color theme="1"/>"#),
    }
    match &format.font_family {
        Some(name) => xml.push_str(&format!(r#"<name val="{}"/>"#, escape(name))),
        None => xml.push_str(r#"<name val="Calibri"/><family val="2"/><scheme val="minor"/>"#),
    }
    xml.push_str("</font>");
    if xml == DEFAULT_FONT { DEFAULT_FONT.into() } else { xml }
}

fn side_xml(tag: &str, side: &Option<BorderSide>) -> String {
    let Some(side) = side.as_ref().filter(|side| side.style != "none") else {
        return format!("<{tag}/>");
    };
    let style = match side.style.as_str() {
        "medium" | "thick" | "dashed" | "dotted" | "double" => side.style.as_str(),
        _ => "thin",
    };
    let color = side.color.as_deref().and_then(to_argb)
        .map_or_else(|| r#"<color auto="1"/>"#.to_string(), |argb| format!(r#"<color rgb="{argb}"/>"#));
    format!(r#"<{tag} style="{style}">{color}</{tag}>"#)
}

fn border_xml(borders: &Borders) -> String {
    format!("<border>{}{}{}{}<diagonal/></border>", side_xml("left", &borders.left),
        side_xml("right", &borders.right), side_xml("top", &borders.top), side_xml("bottom", &borders.bottom))
}

fn alignment_xml(format: &CellFormat) -> Option<String> {
    let mut attrs = String::new();
    if let Some(align @ ("left" | "center" | "right")) = format.align.as_deref() {
        attrs.push_str(&format!(r#" horizontal="{align}""#));
    }
    if let Some(vertical @ ("top" | "center" | "bottom" | "justify" | "distributed")) = format.vertical_align.as_deref() {
        attrs.push_str(&format!(r#" vertical="{vertical}""#));
    }
    if format.wrap == Some(true) {
        attrs.push_str(r#" wrapText="1""#);
    }
    if let Some(indent) = format.indent.filter(|&n| n > 0) {
        attrs.push_str(&format!(r#" indent="{indent}""#));
    }
    (!attrs.is_empty()).then(|| format!("<alignment{attrs}/>"))
}
