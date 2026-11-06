//! 给 `c:strRef` / `c:numRef` 补上 `strCache` / `numCache`，没有重算能力的阅读器也能显示图表。
//! 值取自原生文件的单元格（公式格只用原生文件里已有的缓存值，没有就跳过该点）。
//! 在图表 XML 生成之后按 `c:f` 里的公式回填，所以与图表类型无关。

use crate::native::{CellValue, Persistence};
use crate::write::cell_values::Cells;
use crate::write::package::Part;
use crate::write::xml::escape;

/// 给 `parts` 里 `xl/charts/` 下的图表部件回填缓存。
pub fn add_caches(parts: &mut [Part], book: &Persistence) {
    if !parts.iter().any(|part| part.path.starts_with("xl/charts/")) { return; }
    let cells = Cells::new(book);
    for part in parts.iter_mut().filter(|part| part.path.starts_with("xl/charts/")) {
        part.body = fill(&part.body, &cells);
    }
}

fn fill(xml: &str, cells: &Cells) -> String {
    let mut out = String::with_capacity(xml.len() * 2);
    let mut rest = xml;
    while let Some(start) = rest.find("<c:f>") {
        let after = &rest[start + 5..];
        let Some(end) = after.find("</c:f>") else { break };
        let tail = &after[end + 6..];
        out.push_str(&rest[..start + 5 + end + 6]);
        rest = tail;
        let numeric = tail.starts_with("</c:numRef>");
        if !numeric && !tail.starts_with("</c:strRef>") { continue; }
        if let Some(points) = resolve(&unescape(&after[..end]), cells) {
            out.push_str(&cache(&points, numeric));
        }
    }
    out.push_str(rest);
    out
}

/// 引用里的单元格（总数, 有值的点）；点的下标按引用顺序从 0 起。
fn resolve(formula: &str, cells: &Cells) -> Option<(u64, Vec<(u64, CellValue)>)> {
    let values = cells.values(formula)?;
    let points = values.iter().enumerate()
        .filter_map(|(index, value)| value.clone().map(|value| (index as u64, value))).collect();
    Some((values.len() as u64, points))
}

fn cache(data: &(u64, Vec<(u64, CellValue)>), numeric: bool) -> String {
    let (total, points) = data;
    let body: String = points.iter().filter_map(|(index, value)| {
        let text = match (value, numeric) {
            (CellValue::Number(n), _) => n.to_string(),
            (CellValue::Boolean(b), false) => if *b { "TRUE" } else { "FALSE" }.to_string(),
            (CellValue::Text(t), false) if !t.is_empty() => t.clone(),
            _ => return None,
        };
        Some(format!(r#"<c:pt idx="{index}"><c:v>{}</c:v></c:pt>"#, escape(&text)))
    }).collect();
    if numeric {
        format!(r#"<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="{total}"/>{body}</c:numCache>"#)
    } else {
        format!(r#"<c:strCache><c:ptCount val="{total}"/>{body}</c:strCache>"#)
    }
}

fn unescape(text: &str) -> String {
    text.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&amp;", "&")
}
