//! 原生 Table → `xl/tables/tableN.xml`，并在工作表里挂 `<tableParts>`。
//! 汇总函数与计算列不写：汇总行/计算列的单元格内容本身已经在工作表里。

use super::package::Part;
use super::rels::Rels;
use super::xml::escape;
use crate::address::parse_range;
use crate::native::Table;

const TABLE_CONTENT_TYPE: &str = "application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml";

fn style_name(preset: &str) -> Option<&'static str> {
    match preset {
        "blue" => Some("TableStyleMedium2"),
        "gray" => Some("TableStyleMedium4"),
        "green" => Some("TableStyleMedium7"),
        _ => None,
    }
}

fn flag(on: bool) -> &'static str {
    if on { "1" } else { "0" }
}

fn table_xml(table: &Table, id: usize) -> Option<String> {
    let [r1, c1, r2, c2] = parse_range(&table.range)?;
    if table.columns.len() as u32 != c2 - c1 + 1 || table.columns.iter().any(|name| name.is_empty()) {
        return None;
    }
    let mut seen = std::collections::HashSet::new();
    if !table.columns.iter().all(|name| seen.insert(name.to_lowercase())) {
        return None;
    }
    let mut attrs = String::new();
    if !table.has_headers {
        attrs.push_str(r#" headerRowCount="0""#);
    }
    if table.has_totals {
        attrs.push_str(r#" totalsRowCount="1""#);
    }
    let filter = if table.has_headers {
        let last = if table.has_totals { r2 - 1 } else { r2 };
        format!(r#"<autoFilter ref="{}"/>"#, crate::address::range_name([r1, c1, last, c2]))
    } else {
        String::new()
    };
    let columns: String = table.columns.iter().enumerate()
        .map(|(i, name)| format!(r#"<tableColumn id="{}" name="{}"/>"#, i + 1, escape(name))).collect();
    let name = style_name(&table.style.preset).map(|n| format!(r#" name="{n}""#)).unwrap_or_default();
    let style = &table.style;
    Some(format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="{id}" name="{n}" displayName="{n}" ref="{r}"{attrs}>{filter}<tableColumns count="{count}">{columns}</tableColumns><tableStyleInfo{name} showFirstColumn="{}" showLastColumn="{}" showRowStripes="{}" showColumnStripes="{}"/></table>"#,
        flag(style.first_column), flag(style.last_column), flag(style.banded_rows), flag(style.banded_columns),
        n = escape(&table.name), r = crate::address::range_name([r1, c1, r2, c2]), count = table.columns.len()))
}

/// 返回 `<tableParts>` 片段；`next_id` 是工作簿内递增的表编号（同时用作文件名）。
pub fn build(tables: &[&Table], next_id: &mut usize, rels: &mut Rels, parts: &mut Vec<Part>) -> (String, usize) {
    let mut refs = String::new();
    let mut skipped = 0usize;
    for table in tables {
        let id = *next_id;
        let Some(body) = table_xml(table, id) else {
            skipped += 1;
            continue;
        };
        *next_id += 1;
        let path = format!("xl/tables/table{id}.xml");
        let rid = rels.add("table", &format!("../tables/table{id}.xml"), false);
        parts.push(Part { path, body, content_type: Some(TABLE_CONTENT_TYPE), bytes: None });
        refs.push_str(&format!(r#"<tablePart r:id="{rid}"/>"#));
    }
    let xml = if refs.is_empty() {
        String::new()
    } else {
        format!(r#"<tableParts count="{}">{refs}</tableParts>"#, refs.matches("<tablePart ").count())
    };
    (xml, skipped)
}
