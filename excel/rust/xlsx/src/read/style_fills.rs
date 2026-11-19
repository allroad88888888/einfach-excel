//! SpreadsheetML fill records preserve the independent pattern foreground and base color.
use crate::native::CellFormat;
use crate::native_fill::{CellFill, FillPattern};
use super::{dom::{self, Node}, dxf::color_of};

#[derive(Default)]
pub struct Fill {
    background: Option<String>,
    descriptor: Option<CellFill>,
}

impl Fill {
    pub fn apply(&self, format: &mut CellFormat) {
        format.bg_color = Some(self.background.clone());
        format.fill = Some(self.descriptor.clone());
    }
}

fn fill_color(node: Option<&Node>, theme: &[String], fallback: &str, losses: &mut usize) -> String {
    let Some(node) = node else { return fallback.into() };
    if node.attr_bool("auto", false) || node.attr("indexed") == Some("64") {
        return fallback.into();
    }
    color_of(node, theme).unwrap_or_else(|| { *losses += 1; fallback.into() })
}

pub fn parse(xml: &str, theme: &[String]) -> (Vec<Fill>, usize, usize) {
    let Some(root) = dom::parse(xml, &["fonts", "borders", "cellXfs", "dxfs"]) else {
        return (Vec::new(), 0, 0);
    };
    let Some(fills) = root.child("fills") else { return (Vec::new(), 0, 0) };
    let mut losses = 0;
    let mut incomplete = 0;
    let values = fills.each("fill").map(|fill| {
        if let Some(node) = fill.child("gradientFill") {
            if let Some(descriptor) = super::gradient_fills::parse(node, theme, &mut losses) {
                if descriptor.gradient_stops().is_some_and(|stops| stops.is_empty()) { incomplete += 1; }
                return Fill { background: Some(descriptor.gradient_base().unwrap_or("#000000").into()),
                    descriptor: Some(descriptor) };
            }
            losses += 1;
            return Fill { background: node.child("stop").and_then(|stop| stop.child("color"))
                .and_then(|color| color_of(color, theme)), descriptor: None };
        }
        let Some(pattern) = fill.child("patternFill") else {
            if !fill.children.is_empty() { losses += 1; }
            return Fill::default();
        };
        let kind = pattern.attr("patternType").unwrap_or("none");
        if kind == "none" { return Fill::default(); }
        if kind == "solid" {
            return Fill { background: Some(fill_color(pattern.child("fgColor"), theme, "#000000", &mut losses)),
                descriptor: None };
        }
        let Some(kind) = FillPattern::from_xml(kind) else {
            losses += 1;
            return Fill::default();
        };
        Fill {
            background: Some(fill_color(pattern.child("bgColor"), theme, "#ffffff", &mut losses)),
            descriptor: Some(CellFill::Pattern { pattern: kind,
                foreground: fill_color(pattern.child("fgColor"), theme, "#000000", &mut losses) }),
        }
    }).collect();
    (values, losses, incomplete)
}

/// Conditional highlighting currently accepts solid backgrounds only.
pub fn unsupported_dxf_count(xml: Option<&str>) -> usize {
    let Some(root) = xml.and_then(|xml| dom::parse(xml, &["fonts", "fills", "borders", "cellXfs"])) else {
        return 0;
    };
    root.child("dxfs").map_or(0, |dxfs| dxfs.each("dxf").filter(|dxf| {
        dxf.child("fill").is_some_and(|fill| fill.child("gradientFill").is_some()
            || fill.child("patternFill").is_some_and(|pattern| {
                !matches!(pattern.attr("patternType"), None | Some("solid" | "none"))
            }))
    }).count())
}
