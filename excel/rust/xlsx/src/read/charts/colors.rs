//! 系列（饼图、圆环按类别）的 srgb 颜色；主题色等其他写法忽略，交给插件配色。

use super::tree::path;
use crate::read::dom::Node;

fn srgb(props: &Node) -> Option<String> {
    let hex = path(props, &["solidFill", "srgbClr"]).or_else(|| path(props, &["ln", "solidFill", "srgbClr"]))
        .and_then(|color| color.attr("val"))?;
    (hex.len() == 6 && hex.chars().all(|c| c.is_ascii_hexdigit())).then(|| format!("#{}", hex.to_ascii_uppercase()))
}

fn series_color(ser: &Node) -> Option<String> {
    ser.child("spPr").and_then(srgb).or_else(|| ser.child("marker").and_then(|m| m.child("spPr")).and_then(srgb))
}

/// `sers` 按绘制顺序。末尾的缺省项去掉，全缺省就是空数组。
pub fn read(sers: &[&Node], by_category: bool) -> Vec<Option<String>> {
    let mut colors: Vec<Option<String>> = if by_category {
        let mut slots = Vec::new();
        for point in sers.first().map(|ser| ser.each("dPt")).into_iter().flatten() {
            let Some(index) = path(point, &["idx"]).and_then(|idx| idx.attr_u32("val")) else { continue };
            let index = index as usize;
            if index > 255 { continue; }
            if slots.len() <= index { slots.resize(index + 1, None); }
            slots[index] = point.child("spPr").and_then(srgb);
        }
        slots
    } else {
        sers.iter().map(|ser| series_color(ser)).collect()
    };
    while colors.last().is_some_and(Option::is_none) {
        colors.pop();
    }
    colors
}
