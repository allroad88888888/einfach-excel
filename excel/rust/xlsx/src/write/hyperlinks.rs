//! 原生超链接 → `<hyperlinks>`：目标放进工作表关系（External），元素里只留 `r:id`。

use super::rels::Rels;
use crate::address::cell_name;
use crate::native::Hyperlink;

pub fn xml(links: &[&Hyperlink], rels: &mut Rels) -> String {
    if links.is_empty() {
        return String::new();
    }
    let mut sorted: Vec<&&Hyperlink> = links.iter().collect();
    sorted.sort_by_key(|link| (link.row, link.col));
    let items: String = sorted.iter().map(|link| {
        let id = rels.add("hyperlink", &link.url, true);
        format!(r#"<hyperlink ref="{}" r:id="{id}"/>"#, cell_name(link.row, link.col))
    }).collect();
    format!("<hyperlinks>{items}</hyperlinks>")
}
