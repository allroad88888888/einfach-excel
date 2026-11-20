//! 原生工作表保护 → `<sheetProtection>` 与 `<protectedRanges>`（位于 `</sheetData>` 之后、`<mergeCells>` 之前）。

use crate::address::range_name;
use crate::native::{
    ProtectionMode, SheetProtection, MAX_COLS, MAX_ROWS, MAX_UNLOCKED_RANGES,
};

pub fn xml(entry: Option<&SheetProtection>) -> (String, usize) {
    let Some(entry) = entry.filter(|p| !p.is_default()) else {
        return (String::new(), 0);
    };
    let mut out = String::new();
    let mut losses = 0usize;

    if entry.mode == ProtectionMode::Protected || !entry.permissions.is_default() {
        let sheet_flag = u8::from(entry.mode == ProtectionMode::Protected);
        let mut attrs = format!(r#" sheet="{sheet_flag}""#);
        if entry.mode == ProtectionMode::Protected {
            attrs.push_str(r#" objects="1" scenarios="1""#);
        }
        // OOXML `<sheetProtection>` 权限属性 0 表示放行，默认 1 表示锁定。
        for (allowed, attr) in [
            (entry.permissions.sort, "sort"),
            (entry.permissions.insert_rows, "insertRows"),
            (entry.permissions.insert_columns, "insertColumns"),
            (entry.permissions.delete_rows, "deleteRows"),
            (entry.permissions.delete_columns, "deleteColumns"),
        ] {
            if allowed {
                attrs.push_str(&format!(r#" {attr}="0""#));
            }
        }
        out.push_str(&format!("<sheetProtection{attrs}/>"));
    }

    let mut valid_ranges = Vec::new();
    for r in &entry.unlocked_ranges {
        if r.row_start <= r.row_end
            && r.col_start <= r.col_end
            && r.row_end < MAX_ROWS
            && r.col_end < MAX_COLS
        {
            if valid_ranges.len() < MAX_UNLOCKED_RANGES {
                valid_ranges.push(*r);
            } else {
                losses += 1;
            }
        } else {
            losses += 1;
        }
    }

    if !valid_ranges.is_empty() {
        out.push_str("<protectedRanges>");
        for (i, r) in valid_ranges.iter().enumerate() {
            let sqref = range_name([r.row_start, r.col_start, r.row_end, r.col_end]);
            out.push_str(&format!(r#"<protectedRange name="Range{}" sqref="{sqref}"/>"#, i + 1));
        }
        out.push_str("</protectedRanges>");
    }

    (out, losses)
}
