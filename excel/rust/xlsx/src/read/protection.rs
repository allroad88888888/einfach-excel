//! `<sheetProtection>`、`<protectedRanges>` 与单元格 `<protection locked="0"/>` → 原生工作表保护。

use std::collections::{BTreeMap, BTreeSet};

use super::dom::Node;
use super::worksheet::SheetData;
use crate::address::parse_range;
use crate::native::{
    ProtectionMode, ProtectionPermissions, ProtectionRange, SheetProtection, MAX_COLS, MAX_ROWS,
    MAX_UNLOCKED_RANGES,
};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum XfLock {
    #[default]
    Default,
    Unlocked,
    Locked,
}

fn push_unique_range(out: &mut Vec<ProtectionRange>, candidate: ProtectionRange) {
    if candidate.row_start > candidate.row_end
        || candidate.col_start > candidate.col_end
        || candidate.row_end >= MAX_ROWS
        || candidate.col_end >= MAX_COLS
    {
        return;
    }
    let already_covered = out.iter().any(|existing| {
        existing.row_start <= candidate.row_start
            && candidate.row_end <= existing.row_end
            && existing.col_start <= candidate.col_start
            && candidate.col_end <= existing.col_end
    });
    if !already_covered {
        out.push(candidate);
    }
}

fn coalesce_cells(cells_by_row: BTreeMap<u32, BTreeSet<u32>>) -> Vec<ProtectionRange> {
    let mut open: BTreeMap<(u32, u32), (u32, u32)> = BTreeMap::new();
    let mut finished = Vec::new();
    for (row, cols) in cells_by_row {
        let mut row_spans = Vec::new();
        let mut cur: Option<(u32, u32)> = None;
        for col in cols {
            match cur {
                Some((s, e)) if col == e + 1 => cur = Some((s, col)),
                Some(span) => {
                    row_spans.push(span);
                    cur = Some((col, col));
                }
                None => cur = Some((col, col)),
            }
        }
        if let Some(span) = cur {
            row_spans.push(span);
        }
        let mut next_open = BTreeMap::new();
        for span in row_spans {
            if let Some((r_start, r_end)) = open.remove(&span) {
                if r_end + 1 == row {
                    next_open.insert(span, (r_start, row));
                    continue;
                }
                finished.push(ProtectionRange {
                    row_start: r_start,
                    row_end: r_end,
                    col_start: span.0,
                    col_end: span.1,
                });
            }
            next_open.insert(span, (row, row));
        }
        for ((c1, c2), (r1, r2)) in open {
            finished.push(ProtectionRange {
                row_start: r1,
                row_end: r2,
                col_start: c1,
                col_end: c2,
            });
        }
        open = next_open;
    }
    for ((c1, c2), (r1, r2)) in open {
        finished.push(ProtectionRange {
            row_start: r1,
            row_end: r2,
            col_start: c1,
            col_end: c2,
        });
    }
    finished.sort();
    finished
}

fn unlocked_from_styles(data: &SheetData, xf_locks: &[XfLock], out: &mut Vec<ProtectionRange>) {
    if !xf_locks.contains(&XfLock::Unlocked) {
        return;
    }
    let lock_of = |xf: u32| xf_locks.get(xf as usize).copied().unwrap_or(XfLock::Default);

    // 整列解锁且未被显式锁定格打断的列直接生成列区间，避免展开百万行。
    let mut locked_cells_by_col: BTreeMap<u32, BTreeSet<u32>> = BTreeMap::new();
    let mut locked_cells_by_row: BTreeMap<u32, BTreeSet<u32>> = BTreeMap::new();
    for cell in &data.cells {
        if cell.row < MAX_ROWS && cell.col < MAX_COLS && lock_of(cell.style) == XfLock::Locked {
            locked_cells_by_col.entry(cell.col).or_default().insert(cell.row);
            locked_cells_by_row.entry(cell.row).or_default().insert(cell.col);
        }
    }
    let locked_rows: BTreeSet<u32> = data
        .row_styles
        .iter()
        .filter(|&&(r, s)| r < MAX_ROWS && lock_of(s) == XfLock::Locked)
        .map(|&(r, _)| r)
        .collect();

    for &(min, max, style) in &data.column_styles {
        if lock_of(style) != XfLock::Unlocked {
            continue;
        }
        let c_start = min.saturating_sub(1);
        let c_end = max.min(MAX_COLS).saturating_sub(1);
        for col in c_start..=c_end {
            let mut blocked = locked_rows.clone();
            if let Some(rows) = locked_cells_by_col.get(&col) {
                blocked.extend(rows.iter().copied());
            }
            let mut r_start = 0u32;
            for r_lock in blocked {
                if r_start < r_lock {
                    push_unique_range(
                        out,
                        ProtectionRange {
                            row_start: r_start,
                            row_end: r_lock - 1,
                            col_start: col,
                            col_end: col,
                        },
                    );
                }
                r_start = r_lock.saturating_add(1);
            }
            if r_start < MAX_ROWS {
                push_unique_range(
                    out,
                    ProtectionRange {
                        row_start: r_start,
                        row_end: MAX_ROWS - 1,
                        col_start: col,
                        col_end: col,
                    },
                );
            }
        }
    }

    for &(row, style) in &data.row_styles {
        if row >= MAX_ROWS || lock_of(style) != XfLock::Unlocked {
            continue;
        }
        let mut c_start = 0u32;
        if let Some(cols) = locked_cells_by_row.get(&row) {
            for &c_lock in cols {
                if c_start < c_lock {
                    push_unique_range(
                        out,
                        ProtectionRange {
                            row_start: row,
                            row_end: row,
                            col_start: c_start,
                            col_end: c_lock - 1,
                        },
                    );
                }
                c_start = c_lock.saturating_add(1);
            }
        }
        if c_start < MAX_COLS {
            push_unique_range(
                out,
                ProtectionRange {
                    row_start: row,
                    row_end: row,
                    col_start: c_start,
                    col_end: MAX_COLS - 1,
                },
            );
        }
    }

    let mut unlocked_cells: BTreeMap<u32, BTreeSet<u32>> = BTreeMap::new();
    for cell in &data.cells {
        if cell.row < MAX_ROWS && cell.col < MAX_COLS && lock_of(cell.style) == XfLock::Unlocked {
            unlocked_cells.entry(cell.row).or_default().insert(cell.col);
        }
    }
    for rect in coalesce_cells(unlocked_cells) {
        push_unique_range(out, rect);
    }
}

pub fn parse(extras: &Node, data: &SheetData, xf_locks: &[XfLock]) -> (Option<SheetProtection>, usize) {
    let mut protection = SheetProtection::default();
    let mut losses = 0usize;

    if let Some(sp) = extras.child("sheetProtection") {
        if sp.attr_bool("sheet", false) {
            protection.mode = ProtectionMode::Protected;
        }
        // OOXML `<sheetProtection>` 权限属性含义为「是否禁止」（默认 true=禁止，0/false=允许）。
        protection.permissions = ProtectionPermissions {
            sort: !sp.attr_bool("sort", true),
            insert_rows: !sp.attr_bool("insertRows", true),
            insert_columns: !sp.attr_bool("insertColumns", true),
            delete_rows: !sp.attr_bool("deleteRows", true),
            delete_columns: !sp.attr_bool("deleteColumns", true),
        };
    }

    if let Some(ranges) = extras.child("protectedRanges") {
        for pr in ranges.each("protectedRange") {
            let has_password = pr.attr("password").is_some_and(|s| !s.is_empty())
                || pr.attr("algorithmName").is_some_and(|s| !s.is_empty())
                || pr.attr("hashValue").is_some_and(|s| !s.is_empty());
            if has_password {
                losses += 1;
                continue;
            }
            let Some(sqref) = pr.attr("sqref") else { continue };
            for token in sqref.split_whitespace() {
                if let Some([r1, c1, r2, c2]) = parse_range(token) {
                    push_unique_range(
                        &mut protection.unlocked_ranges,
                        ProtectionRange { row_start: r1, row_end: r2, col_start: c1, col_end: c2 },
                    );
                }
            }
        }
    }

    unlocked_from_styles(data, xf_locks, &mut protection.unlocked_ranges);

    if protection.unlocked_ranges.len() > MAX_UNLOCKED_RANGES {
        protection.unlocked_ranges.truncate(MAX_UNLOCKED_RANGES);
        losses += 1;
    }

    let kept = (!protection.is_default()).then_some(protection);
    (kept, losses)
}
