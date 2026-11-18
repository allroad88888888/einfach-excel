//! The two direction flags share one SpreadsheetML line specification.
use crate::native::{BorderSide, Borders};
use super::{dom, dxf::color_of, styles::border_style};

pub fn parse(xml: &str, theme: &[String]) -> (Vec<Borders>, usize) {
    let Some(root) = dom::parse(xml, &["fonts", "fills", "cellXfs", "dxfs"]) else {
        return (Vec::new(), 0);
    };
    let Some(borders) = root.child("borders") else { return (Vec::new(), 0) };
    let mut unsupported = 0;
    let values = borders.each("border").map(|border| {
        let up = border.attr_bool("diagonalUp", false);
        let down = border.attr_bool("diagonalDown", false);
        let mut result = Borders::default();
        if !up && !down { return result; }
        let Some(diagonal) = border.child("diagonal") else { return result };
        let Some(raw_style) = diagonal.attr("style").filter(|style| *style != "none") else { return result };
        let style = border_style(raw_style);
        if style != Some(raw_style) { unsupported += 1; }
        let Some(style) = style else { return result };
        let spec = BorderSide { style: style.into(),
            color: diagonal.child("color").and_then(|color| color_of(color, theme)) };
        if up { result.diag_up = Some(spec.clone()); }
        if down { result.diag_down = Some(spec); }
        result
    }).collect();
    (values, unsupported)
}
