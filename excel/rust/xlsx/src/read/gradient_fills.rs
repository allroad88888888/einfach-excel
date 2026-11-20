//! SpreadsheetML linear/path gradients; preserve original geometry and stop order.
use crate::native_fill::{CellFill, GradientStop};
use super::{dom::Node, dxf::color_of};

fn number(node: &Node, name: &str, default: f64) -> Option<f64> {
    let value = match node.attr(name) { Some(raw) => raw.trim().parse().ok()?, None => default };
    if f64::is_finite(value) { Some(value) } else { None }
}

pub fn parse(node: &Node, theme: &[String], color_losses: &mut usize) -> Option<CellFill> {
    enum Geometry {
        Linear(f64),
        Path { left: f64, right: f64, top: f64, bottom: f64 },
    }
    let geometry = match node.attr("type").unwrap_or("linear") {
        "linear" => Geometry::Linear(number(node, "degree", 0.0)?),
        "path" => {
            let left = number(node, "left", 0.0)?;
            let right = number(node, "right", 0.0)?;
            let top = number(node, "top", 0.0)?;
            let bottom = number(node, "bottom", 0.0)?;
            if ![left, right, top, bottom].iter().all(|n| (0.0..=1.0).contains(n)) { return None; }
            Geometry::Path { left, right, top, bottom }
        }
        _ => return None,
    };
    let mut stops = Vec::new();
    let mut local_losses = 0;
    for stop in node.each("stop") {
        if stops.len() == 256 { return None; }
        let position = stop.attr_f64("position")?;
        if !position.is_finite() || !(0.0..=1.0).contains(&position) { return None; }
        let color = stop.child("color").and_then(|color| color_of(color, theme))
            .unwrap_or_else(|| { local_losses += 1; "#000000".into() });
        stops.push(GradientStop { position, color });
    }
    *color_losses += local_losses;
    Some(match geometry {
        Geometry::Linear(degree) => CellFill::LinearGradient { degree, stops },
        Geometry::Path { left, right, top, bottom } => {
            CellFill::PathGradient { left, right, top, bottom, stops }
        }
    })
}
