//! `styles.xml` 的 `<dxfs>`：条件格式用的差异样式，只取原生高亮能表达的字体色/填充色/粗斜下划线。

use serde_json::{json, Map, Value};

use super::dom::{self, Node};
use crate::color;

/// 按 dxfId 下标存放的原生高亮（`format` 对象）；表达不了任何属性的差异样式为 None。
pub fn parse(styles_xml: Option<&str>, theme: &[String]) -> Vec<Option<Value>> {
    let Some(root) = styles_xml.and_then(|xml| dom::parse(xml, &[])) else { return Vec::new() };
    let Some(dxfs) = root.child("dxfs") else { return Vec::new() };
    dxfs.each("dxf").map(|dxf| highlight(dxf, theme)).collect()
}

/// `<color rgb|theme|indexed>` → `#rrggbb`。
pub fn color_of(node: &Node, theme: &[String]) -> Option<String> {
    if let Some(rgb) = node.attr("rgb") {
        return color::from_argb(rgb);
    }
    if let Some(index) = node.attr_u32("theme") {
        return color::from_theme(theme, index as usize, node.attr_f64("tint").unwrap_or(0.0));
    }
    node.attr_u32("indexed").and_then(|index| color::from_indexed(index as usize))
}

fn highlight(dxf: &Node, theme: &[String]) -> Option<Value> {
    let mut format = Map::new();
    if let Some(font) = dxf.child("font") {
        for (tag, key) in [("b", "bold"), ("i", "italic"), ("u", "underline")] {
            // `<u val="none"/>` 与 `<b val="0"/>` 都表示关闭。
            let on = font.child(tag).is_some_and(|n| n.attr("val").map_or(true, |v| !matches!(v, "0" | "false" | "none")));
            if on {
                format.insert(key.into(), json!(true));
            }
        }
        if let Some(fg) = font.child("color").and_then(|c| color_of(c, theme)) {
            format.insert("fgColor".into(), json!(fg));
        }
    }
    if let Some(pattern) = dxf.child("fill").and_then(|fill| fill.child("patternFill")) {
        // dxf 的纯色填充把颜色放在 bgColor；个别写法放 fgColor。
        let bg = pattern.child("bgColor").and_then(|c| color_of(c, theme))
            .or_else(|| pattern.child("fgColor").and_then(|c| color_of(c, theme)));
        if let Some(bg) = bg {
            format.insert("bgColor".into(), json!(bg));
        }
    }
    (!format.is_empty()).then(|| Value::Object(format))
}
