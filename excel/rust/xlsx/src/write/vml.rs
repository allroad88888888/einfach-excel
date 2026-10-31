//! 批注的 VML 绘图部件：Excel 靠它决定批注框的位置与可见性，没有它旧式批注不会显示。

use std::collections::BTreeMap;

/// `sheet_index` 决定 shape id 段，避免多张工作表的批注框 id 冲突。
pub fn xml(comments: &BTreeMap<(u32, u32), String>, sheet_index: usize) -> String {
    let block = sheet_index + 1;
    let shapes: String = comments.keys().enumerate().map(|(n, &(row, col))| {
        let id = block * 1024 + n + 1;
        format!(concat!(
            r##"<v:shape id="_x0000_s{id}" type="#_x0000_t202" style="position:absolute;margin-left:80pt;margin-top:2pt;width:120pt;height:60pt;z-index:{z};visibility:hidden" fillcolor="#ffffe1" o:insetmode="auto">"##,
            r##"<v:fill color2="#ffffe1"/><v:shadow on="t" color="black" obscured="t"/><v:path o:connecttype="none"/>"##,
            r#"<v:textbox style="mso-direction-alt:auto"><div style="text-align:left"></div></v:textbox>"#,
            r#"<x:ClientData ObjectType="Note"><x:MoveWithCells/><x:SizeWithCells/>"#,
            r#"<x:Anchor>{c1}, 15, {r1}, 2, {c2}, 15, {r2}, 4</x:Anchor><x:AutoFill>False</x:AutoFill>"#,
            r#"<x:Row>{row}</x:Row><x:Column>{col}</x:Column></x:ClientData></v:shape>"#),
            id = id, z = n + 1, c1 = col + 1, r1 = row.saturating_sub(1), c2 = col + 3, r2 = row + 3, row = row, col = col)
    }).collect();
    format!(concat!(
        r#"<xml xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">"#,
        r#"<o:shapelayout v:ext="edit"><o:idmap v:ext="edit" data="{block}"/></o:shapelayout>"#,
        r#"<v:shapetype id="_x0000_t202" coordsize="21600,21600" o:spt="202" path="m,l,21600r21600,l21600,xe"><v:stroke joinstyle="miter"/><v:path gradientshapeok="t" o:connecttype="rect"/></v:shapetype>{shapes}</xml>"#),
        block = block, shapes = shapes)
}
