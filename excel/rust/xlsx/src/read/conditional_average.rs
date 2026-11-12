//! Strict SpreadsheetML mean attributes; standard-deviation rules remain unsupported.
use serde_json::{json, Value};
use super::dom::Node;

fn boolean(node: &Node, name: &str, fallback: bool) -> Option<bool> {
    match node.attr(name).map(str::trim) {
        None => Some(fallback),
        Some("1" | "true") => Some(true),
        Some("0" | "false") => Some(false),
        _ => None,
    }
}

pub(super) fn rule(node: &Node) -> Option<Value> {
    if let Some(value) = node.attr("stdDev") {
        if value.trim().parse::<u32>().ok()? != 0 { return None; }
    }
    Some(json!({"kind":"above-average",
        "direction":if boolean(node, "aboveAverage", true)? { "above" } else { "below" },
        "equalAverage":boolean(node, "equalAverage", false)?}))
}
