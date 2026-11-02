//! `xl/tables/tableN.xml` → 原生 Table。
//! 原生 Table 的样式只有 blue / green / gray / none 四档，按 Excel 内置样式的主题色归并；
//! 筛选状态、计算列、汇总函数不转换（汇总行的单元格内容本身在工作表里）。

use super::dom::{self, Node};
use crate::address::{cell_name, parse_cell, parse_range};
use crate::native::{Table, TableStyle};

/// 内置样式 `TableStyleMediumN` → 主题色档位：N=2/9 是 accent1（蓝），4/11 是 accent3（灰），
/// 7/14 是 accent6（绿）；Light/Dark 系列和其他颜色一律不上色。
fn preset_of(name: &str) -> &'static str {
    let number = name.strip_prefix("TableStyleMedium").and_then(|n| n.parse::<u32>().ok());
    match number {
        Some(2 | 9) => "blue",
        Some(4 | 11) => "gray",
        Some(7 | 14) => "green",
        _ => "none",
    }
}

/// 表名规则（与引擎一致）：ASCII 字母数字下划线，不以数字开头，不像单元格地址。
pub fn is_valid_name(name: &str) -> bool {
    let mut bytes = name.bytes();
    let start = bytes.next().is_some_and(|b| b.is_ascii_alphabetic() || b == b'_');
    if !start || name.len() > 255 || !bytes.all(|b| b.is_ascii_alphanumeric() || b == b'_') {
        return false;
    }
    let upper = name.to_ascii_uppercase();
    let r1c1 = upper.strip_prefix('R').and_then(|rest| rest.split_once('C')).is_some_and(|(r, c)| {
        r.bytes().all(|b| b.is_ascii_digit()) && c.bytes().all(|b| b.is_ascii_digit())
    });
    upper != "R" && upper != "C" && !r1c1 && parse_cell(&upper).is_none()
}

pub fn parse(xml: &str, sheet_name: &str, sheet_index: usize) -> (Option<Table>, usize) {
    let Some(root) = dom::parse(xml, &[]) else { return (None, 1) };
    let mut dropped = 0usize;
    if let Some(af) = root.child("autoFilter") {
        if !af.children.is_empty() {
            dropped += 1;
        }
    }
    if let Some(cols) = root.child("tableColumns") {
        for col in cols.each("tableColumn") {
            if col.child("calculatedColumnFormula").is_some()
                || col.child("totalsRowFormula").is_some()
                || col.attr("totalsRowFunction").is_some_and(|f| f != "none")
            {
                dropped += 1;
            }
        }
    }
    let build = || -> Option<Table> {
        let name = root.attr("displayName").or(root.attr("name"))?.to_string();
        let [r1, c1, r2, c2] = parse_range(root.attr("ref")?)?;
        let has_headers = root.attr_u32("headerRowCount").unwrap_or(1) > 0;
        let has_totals = root.attr_u32("totalsRowCount").unwrap_or(0) > 0;
        let columns: Vec<String> = root.child("tableColumns")?.each("tableColumn")
            .map(|c| c.attr("name").unwrap_or_default().to_string()).collect();
        let min_rows = 1 + u32::from(has_headers) + u32::from(has_totals);
        if !is_valid_name(&name) || columns.len() as u32 != c2 - c1 + 1 || r2 - r1 + 1 < min_rows {
            return None;
        }
        let style = root.child("tableStyleInfo").map(style_of).unwrap_or_default();
        Some(Table {
            name,
            sheet: sheet_name.to_string(),
            sheet_index: sheet_index as u32,
            range: format!("{}:{}", cell_name(r1, c1), cell_name(r2, c2)),
            has_headers,
            has_totals,
            columns,
            style,
        })
    };
    match build() {
        Some(table) => (Some(table), dropped),
        None => (None, dropped + 1),
    }
}

fn style_of(info: &Node) -> TableStyle {
    TableStyle {
        preset: preset_of(info.attr("name").unwrap_or_default()).into(),
        banded_rows: info.attr_bool("showRowStripes", false),
        first_column: info.attr_bool("showFirstColumn", false),
        banded_columns: info.attr_bool("showColumnStripes", false),
        last_column: info.attr_bool("showLastColumn", false),
    }
}
