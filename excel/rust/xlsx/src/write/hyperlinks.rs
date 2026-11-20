//! 原生超链接 → `<hyperlinks>`：外部链接写 `r:id` 关系，工作簿内部 `#...` 链接写 `location`。

use std::collections::HashMap;

use super::rels::Rels;
use super::xml::escape;
use crate::address::cell_name;
use crate::native::{CellValue, Hyperlink, SparseCell};

pub fn xml(links: &[&Hyperlink], cells: &[SparseCell], sheet: usize, rels: &mut Rels) -> String {
    if links.is_empty() {
        return String::new();
    }
    let mut text_by_coord: HashMap<(u32, u32), &str> = HashMap::new();
    for cell in cells.iter().filter(|c| c.sheet == sheet && c.kind == "text") {
        if let Some(CellValue::Text(t)) = &cell.value {
            if !t.is_empty() {
                text_by_coord.insert((cell.row, cell.col), t.as_str());
            }
        }
    }
    let mut sorted: Vec<&&Hyperlink> = links.iter().collect();
    sorted.sort_by_key(|link| (link.row, link.col));
    let mut items = String::new();
    for link in sorted {
        let cell = cell_name(link.row, link.col);
        if let Some(loc) = link.url.strip_prefix('#') {
            let trimmed = loc.trim();
            if trimmed.is_empty() {
                continue;
            }
            let display = text_by_coord
                .get(&(link.row, link.col))
                .map(|t| format!(r#" display="{}""#, escape(t)))
                .unwrap_or_default();
            items.push_str(&format!(
                r#"<hyperlink ref="{cell}" location="{}"{display}/>"#,
                escape(trimmed)
            ));
        } else {
            let id = rels.add("hyperlink", &link.url, true);
            items.push_str(&format!(r#"<hyperlink ref="{cell}" r:id="{id}"/>"#));
        }
    }
    if items.is_empty() {
        String::new()
    } else {
        format!("<hyperlinks>{items}</hyperlinks>")
    }
}
