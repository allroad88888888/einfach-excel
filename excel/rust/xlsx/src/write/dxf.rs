//! 原生条件格式高亮（fgColor / bgColor / bold / italic / underline）→ `<dxf>` 差异样式。

use serde_json::Value;

use crate::color::to_argb;

pub fn xml(highlight: &Value) -> Option<String> {
    let flag = |key: &str| highlight[key].as_bool() == Some(true);
    let color = |key: &str| highlight[key].as_str().and_then(to_argb);
    let mut font = String::new();
    for (key, tag) in [("bold", "<b/>"), ("italic", "<i/>"), ("underline", "<u/>")] {
        if flag(key) {
            font.push_str(tag);
        }
    }
    if let Some(argb) = color("fgColor") {
        font.push_str(&format!(r#"<color rgb="{argb}"/>"#));
    }
    let mut out = String::from("<dxf>");
    if !font.is_empty() {
        out.push_str(&format!("<font>{font}</font>"));
    }
    if let Some(argb) = color("bgColor") {
        out.push_str(&format!(r#"<fill><patternFill patternType="solid"><fgColor rgb="{argb}"/><bgColor rgb="{argb}"/></patternFill></fill>"#));
    }
    out.push_str("</dxf>");
    (out != "<dxf></dxf>").then_some(out)
}
