//! workbook table geometry implementation.

use super::*;

pub(crate) enum TableRemap {
    /// The edit didn't touch this Table.
    Keep,
    /// New geometry (and possibly a new column list after an in-table
    /// column insert/delete).
    Resize {
        range: CellRange,
        columns: Vec<String>,
    },
    /// The edit destroyed the Table (header row deleted / all columns
    /// deleted). The registry entry is dropped.
    Delete,
}

/// Build the canonical `=SUBTOTAL(code, Table[Col])` text for a totals-row
/// cell (design doc #32 §7). The formula is assembled as an `Expr` and run
/// through the shared `render_formula`, so the emitted text is guaranteed to
/// re-parse (the T2 round-trip invariant) AND the resulting cell carries a
/// real `Expr::TableRef` node — which is exactly what the table/column rename
/// walkers (§4.3) rewrite, so totals formulas follow renames for free.
pub(crate) fn totals_subtotal_formula(table: &str, column: &str, code: u32) -> String {
    let expr = Expr::FuncCall {
        name: "SUBTOTAL".to_string(),
        args: vec![
            Expr::Number(code as f64),
            Expr::TableRef {
                table: Some(table.to_string()),
                area: TableArea::Data,
                columns: Some((column.to_string(), column.to_string())),
            },
        ],
    };
    crate::shift::render_formula(&expr)
}

/// Do two normalized ranges intersect? (Inclusive rectangles.)
pub(crate) fn ranges_overlap(a: CellRange, b: CellRange) -> bool {
    let a = a.normalize();
    let b = b.normalize();
    a.start.row <= b.end.row
        && b.start.row <= a.end.row
        && a.start.col <= b.end.col
        && b.start.col <= a.end.col
}

/// Is `name` an in-grid A1 cell reference (`AB12`)? Grid-bounded so
/// out-of-grid pseudo-refs like `Table1` (column `TABLE` past `XFD`) are
/// NOT treated as cell references. See `GRID_MAX_COL` / `GRID_MAX_ROW`.
pub(crate) fn name_is_cell_ref_like(name: &str) -> bool {
    match CellAddress::parse(name) {
        Some(addr) => addr.col <= GRID_MAX_COL && addr.row <= GRID_MAX_ROW,
        None => false,
    }
}

/// Next `ColumnN` not already present in `used` (uppercased keys), for
/// blank/duplicate header disambiguation and in-table column inserts.
pub(crate) fn next_auto_column_name(used: &HashSet<String>) -> String {
    let mut n: usize = 1;
    loop {
        let candidate = format!("Column{n}");
        if !used.contains(&candidate.to_ascii_uppercase()) {
            return candidate;
        }
        n += 1;
    }
}

/// Shrink the closed interval `[lo, hi]` by the deletion of `[d0, d1]`
/// (all on one axis). Returns `None` when `[lo, hi]` is fully inside the
/// deleted band (nothing survives). Otherwise returns the reindexed
/// `(new_lo, new_hi)`:
///   - band entirely below (`hi < d0`): unchanged;
///   - band entirely above (`lo > d1`): both shift up by the band width;
///   - partial overlap: the surviving cells close the gap.
fn shrink_interval(lo: u32, hi: u32, d0: u32, d1: u32) -> Option<(u32, u32)> {
    if d0 <= lo && hi <= d1 {
        return None;
    }
    let count = d1 - d0 + 1;
    let new_lo = if lo < d0 {
        lo
    } else if lo > d1 {
        lo - count
    } else {
        d0
    };
    let ov_lo = d0.max(lo);
    let ov_hi = d1.min(hi);
    let deleted = if ov_hi >= ov_lo { ov_hi - ov_lo + 1 } else { 0 };
    let len = (hi - lo + 1) - deleted;
    Some((new_lo, new_lo + len - 1))
}

/// Core of the design doc §4.3 follow matrix for a single Table. Pure: it
/// takes the current geometry and returns the outcome, so it's unit-tested
/// directly and reused by `Workbook::remap_tables_after_shift`.
pub(crate) fn remap_table_geometry(
    range: CellRange,
    columns: &[String],
    edit: crate::shift::ShiftEdit,
) -> TableRemap {
    use crate::shift::ShiftEdit;
    let range = range.normalize();
    let (s_r, e_r) = (range.start.row, range.end.row);
    let (s_c, e_c) = (range.start.col, range.end.col);

    match edit {
        ShiftEdit::RowInsert { at, count } => {
            let ns_r = if s_r >= at { s_r + count } else { s_r };
            let ne_r = if e_r >= at { e_r + count } else { e_r };
            if ns_r == s_r && ne_r == e_r {
                return TableRemap::Keep;
            }
            TableRemap::Resize {
                range: CellRange::new(CellAddress::new(ns_r, s_c), CellAddress::new(ne_r, e_c)),
                columns: columns.to_vec(),
            }
        }
        ShiftEdit::ColInsert { at, count } => {
            let ns_c = if s_c >= at { s_c + count } else { s_c };
            let ne_c = if e_c >= at { e_c + count } else { e_c };
            let mut cols = columns.to_vec();
            // Widening (insert strictly inside the column span): splice in
            // `count` auto-named columns at the insertion index.
            if s_c < at && at <= e_c {
                let idx = (at - s_c) as usize;
                let mut used: HashSet<String> =
                    cols.iter().map(|c| c.to_ascii_uppercase()).collect();
                for offset in 0..count as usize {
                    let name = next_auto_column_name(&used);
                    used.insert(name.to_ascii_uppercase());
                    cols.insert(idx + offset, name);
                }
            }
            if ns_c == s_c && ne_c == e_c && cols.len() == columns.len() {
                return TableRemap::Keep;
            }
            TableRemap::Resize {
                range: CellRange::new(CellAddress::new(s_r, ns_c), CellAddress::new(e_r, ne_c)),
                columns: cols,
            }
        }
        ShiftEdit::RowDelete { at, count } => {
            let d0 = at;
            let d1 = at + count - 1;
            // Header row (row 0 of the range) swallowed → drop the Table.
            if d0 <= s_r && s_r <= d1 {
                return TableRemap::Delete;
            }
            match shrink_interval(s_r, e_r, d0, d1) {
                None => TableRemap::Delete, // unreachable (header survives)
                Some((ns_r, ne_r)) => {
                    if ns_r == s_r && ne_r == e_r {
                        return TableRemap::Keep;
                    }
                    TableRemap::Resize {
                        range: CellRange::new(
                            CellAddress::new(ns_r, s_c),
                            CellAddress::new(ne_r, e_c),
                        ),
                        columns: columns.to_vec(),
                    }
                }
            }
        }
        ShiftEdit::ColDelete { at, count } => {
            let d0 = at;
            let d1 = at + count - 1;
            match shrink_interval(s_c, e_c, d0, d1) {
                None => TableRemap::Delete, // every column deleted
                Some((ns_c, ne_c)) => {
                    // Drop the column names covered by the deleted band.
                    let mut cols = columns.to_vec();
                    let ov_lo = d0.max(s_c);
                    let ov_hi = d1.min(e_c);
                    if ov_hi >= ov_lo {
                        let del_start = (ov_lo - s_c) as usize;
                        let del_end = (ov_hi - s_c) as usize;
                        cols.drain(del_start..=del_end);
                    }
                    if ns_c == s_c && ne_c == e_c && cols.len() == columns.len() {
                        return TableRemap::Keep;
                    }
                    TableRemap::Resize {
                        range: CellRange::new(
                            CellAddress::new(s_r, ns_c),
                            CellAddress::new(e_r, ne_c),
                        ),
                        columns: cols,
                    }
                }
            }
        }
    }
}
