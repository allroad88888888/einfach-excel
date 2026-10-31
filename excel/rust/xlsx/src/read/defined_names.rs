//! `workbook.xml` 的 `<definedNames>` → 原生命名区域。
//! 原生只有"某表某矩形"的名字：公式型、工作表级、内置（`_xlnm.*`）、隐藏、外部引用的名字都跳过。

use std::collections::HashSet;

use super::dom::Node;
use crate::address::{parse_cell, parse_column};
use crate::native::{NamedRange, NamedRangeTarget, MAX_COLS, MAX_ROWS};

/// 与引擎 `validate_named_range_name` 同口径的预检（不含函数名冲突，那需要引擎的函数表）。
fn is_valid_name(name: &str) -> bool {
    let mut chars = name.chars();
    let start = chars.next().is_some_and(|c| c.is_alphabetic() || c == '_' || c == '\\');
    if !start || name.chars().count() > 255 || !chars.all(|c| c.is_alphanumeric() || c == '_' || c == '.') {
        return false;
    }
    let upper = name.to_uppercase();
    let r1c1 = upper.strip_prefix('R').and_then(|rest| rest.split_once('C')).is_some_and(|(r, c)| {
        !r.is_empty() && !c.is_empty() && r.bytes().all(|b| b.is_ascii_digit()) && c.bytes().all(|b| b.is_ascii_digit())
    });
    upper != "R" && upper != "C" && !r1c1 && parse_cell(&upper).is_none()
}

/// `'My Sheet'!$A$1:$B$2` → (工作表名, 引用文本)。
fn split_sheet(reference: &str) -> Option<(String, &str)> {
    if let Some(rest) = reference.strip_prefix('\'') {
        let mut name = String::new();
        let mut chars = rest.char_indices();
        while let Some((i, c)) = chars.next() {
            if c == '\'' {
                if rest[i + 1..].starts_with('\'') {
                    name.push('\'');
                    chars.next();
                } else {
                    return rest[i + 1..].strip_prefix('!').map(|cells| (name, cells));
                }
            } else {
                name.push(c);
            }
        }
        return None;
    }
    let (name, cells) = reference.split_once('!')?;
    (!name.contains(['[', ']'])).then(|| (name.to_string(), cells))
}

/// `$A$1`、`$A$1:$B$2`、整列 `$A:$C`、整行 `$1:$3` → `[r1, c1, r2, c2]`。
fn parse_area(cells: &str) -> Option<[u32; 4]> {
    let plain = cells.replace('$', "");
    let (start, end) = plain.split_once(':').unwrap_or((&plain, &plain));
    if let (Some((r1, c1)), Some((r2, c2))) = (parse_cell(start), parse_cell(end)) {
        return Some([r1.min(r2), c1.min(c2), r1.max(r2), c1.max(c2)]);
    }
    if let (Some(c1), Some(c2)) = (parse_column(start), parse_column(end)) {
        return Some([0, c1.min(c2), MAX_ROWS - 1, c1.max(c2)]);
    }
    if let (Ok(r1), Ok(r2)) = (start.parse::<u32>(), end.parse::<u32>()) {
        if r1 >= 1 && r2 >= 1 {
            return Some([r1.min(r2) - 1, 0, r1.max(r2) - 1, MAX_COLS - 1]);
        }
    }
    None
}

/// `sheet_names` 是 workbook.xml 里的原始表名（按工作表顺序）。
pub fn parse(workbook: &Node, sheet_names: &[String]) -> Vec<NamedRange> {
    let Some(names) = workbook.child("definedNames") else { return Vec::new() };
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for entry in names.each("definedName") {
        let name = entry.attr("name").unwrap_or_default();
        if entry.attr("localSheetId").is_some() || entry.attr_bool("hidden", false)
            || name.starts_with("_xlnm") || !is_valid_name(name) {
            continue;
        }
        let Some((sheet_name, cells)) = split_sheet(entry.text.trim()) else { continue };
        let Some(sheet) = sheet_names.iter().position(|n| n.eq_ignore_ascii_case(&sheet_name)) else { continue };
        let Some(range) = parse_area(cells) else { continue };
        if seen.insert(name.to_uppercase()) {
            out.push(NamedRange { name: name.to_string(), target: Some(NamedRangeTarget { sheet, range }) });
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_quoted_sheet_names_and_areas() {
        assert_eq!(split_sheet("'It''s'!$A$1"), Some(("It's".to_string(), "$A$1")));
        assert_eq!(split_sheet("Data!$B$2:$C$3"), Some(("Data".to_string(), "$B$2:$C$3")));
        assert_eq!(parse_area("$B$2:$A$1"), Some([0, 0, 1, 1]));
        assert_eq!(parse_area("$B:$C"), Some([0, 1, MAX_ROWS - 1, 2]));
        assert_eq!(parse_area("SUM(1)"), None);
        assert!(is_valid_name("Total_2026") && !is_valid_name("A1") && !is_valid_name("R1C1") && !is_valid_name("1x"));
    }
}
