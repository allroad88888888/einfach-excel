//! 局部插删单元格的矩形几何：带外部分保留，带内部分沿位移轴随插删伸缩或收缩。
//! 只计算坐标，不访问单元格、规则或公式内容。
use super::edit::shift_interval;
use super::ShiftEdit;
use crate::sheet::{EXCEL_MAX_COLS, EXCEL_MAX_ROWS};
use crate::{CellAddress, CellRange};

/// `band` 是正交轴上的闭区间（行编辑为列带，列编辑为行带）。返回位移后的矩形集合；
/// 带内部分被整段删除时不产生矩形，插入越过画布末端的部分被裁掉。
pub(crate) fn band_shift_range(bounds: CellRange, edit: ShiftEdit, band: (u32, u32)) -> Vec<CellRange> {
    let rows = edit.is_row_edit();
    let (o_start, o_end) = if rows {
        (bounds.start.col, bounds.end.col)
    } else {
        (bounds.start.row, bounds.end.row)
    };
    let (a_start, a_end) = if rows {
        (bounds.start.row, bounds.end.row)
    } else {
        (bounds.start.col, bounds.end.col)
    };
    let (at, count, insert, limit) = match edit {
        ShiftEdit::RowInsert { at, count } => (at, count, true, EXCEL_MAX_ROWS),
        ShiftEdit::RowDelete { at, count } => (at, count, false, EXCEL_MAX_ROWS),
        ShiftEdit::ColInsert { at, count } => (at, count, true, EXCEL_MAX_COLS),
        ShiftEdit::ColDelete { at, count } => (at, count, false, EXCEL_MAX_COLS),
    };
    let full_axis = a_start == 0 && a_end == limit - 1;
    if count == 0 || o_end < band.0 || o_start > band.1 || a_end < at || full_axis {
        return vec![bounds];
    }
    let piece = |o: (u32, u32), a: (u32, u32)| {
        if rows {
            CellRange::new(CellAddress::new(a.0, o.0), CellAddress::new(a.1, o.1))
        } else {
            CellRange::new(CellAddress::new(o.0, a.0), CellAddress::new(o.1, a.1))
        }
    };
    let mut next = Vec::with_capacity(3);
    if o_start < band.0 {
        next.push(piece((o_start, band.0 - 1), (a_start, a_end)));
    }
    let middle = (o_start.max(band.0), o_end.min(band.1));
    if let Some(axis) = shift_interval(a_start, a_end, at, count, insert, limit) {
        next.push(piece(middle, axis));
    }
    if o_end > band.1 {
        next.push(piece((band.1 + 1, o_end), (a_start, a_end)));
    }
    next
}

/// `band_shift_range` 的同质拆分：每块内各格位移相同，返回（位移前区域, 位移量, 位移后区域）。
/// 插入时带内"未动部分 + 插入格"为一块、位移 0，其后部分整体移动；删除时被删部分消失。
/// 整轴区域位移后仍是整轴：带内的格照样移动，起点处插入的格与末端补进的空格并入相邻的块。
/// 数据验证按块各自换算公式锚点；位移量是（行, 列）。
pub(crate) fn band_shift_pieces(
    bounds: CellRange, edit: ShiftEdit, band: (u32, u32),
) -> Vec<(CellRange, (i64, i64), CellRange)> {
    let rows = edit.is_row_edit();
    let (o_start, o_end, a_start, a_end) = if rows {
        (bounds.start.col, bounds.end.col, bounds.start.row, bounds.end.row)
    } else {
        (bounds.start.row, bounds.end.row, bounds.start.col, bounds.end.col)
    };
    let (at, count, insert, limit) = match edit {
        ShiftEdit::RowInsert { at, count } => (at, count, true, EXCEL_MAX_ROWS),
        ShiftEdit::RowDelete { at, count } => (at, count, false, EXCEL_MAX_ROWS),
        ShiftEdit::ColInsert { at, count } => (at, count, true, EXCEL_MAX_COLS),
        ShiftEdit::ColDelete { at, count } => (at, count, false, EXCEL_MAX_COLS),
    };
    let full_axis = a_start == 0 && a_end == limit - 1;
    if count == 0 || o_end < band.0 || o_start > band.1 || a_end < at {
        return vec![(bounds, (0, 0), bounds)];
    }
    let tail = |end: u32| if full_axis { limit - 1 } else { end };
    let piece = |o: (u32, u32), a: (u32, u32)| if rows {
        CellRange::new(CellAddress::new(a.0, o.0), CellAddress::new(a.1, o.1))
    } else {
        CellRange::new(CellAddress::new(o.0, a.0), CellAddress::new(o.1, a.1))
    };
    let delta = |by: i64| if rows { (by, 0) } else { (0, by) };
    let mut next = Vec::with_capacity(4);
    if o_start < band.0 {
        let side = piece((o_start, band.0 - 1), (a_start, a_end));
        next.push((side, (0, 0), side));
    }
    let middle = (o_start.max(band.0), o_end.min(band.1));
    if insert {
        if a_start < at {
            // 跨过插入线的部分不动，插入格并入其后。
            let after = (a_start, (at + count - 1).min(limit - 1));
            next.push((piece(middle, (a_start, at - 1)), (0, 0), piece(middle, after)));
        }
        let first = a_start.max(at);
        if first + count < limit {
            let after = (first + count, (a_end + count).min(limit - 1));
            let before = (first, after.1 - count);
            let start = if full_axis && a_start >= at { at } else { after.0 };
            next.push((piece(middle, before), delta(i64::from(count)), piece(middle, (start, after.1))));
        }
    } else {
        let last_deleted = at + count - 1;
        let moved = a_end > last_deleted;
        if a_start < at {
            let kept = (a_start, a_end.min(at - 1));
            let end = if moved { kept.1 } else { tail(kept.1) };
            next.push((piece(middle, kept), (0, 0), piece(middle, (kept.0, end))));
        }
        if moved {
            let before = (a_start.max(last_deleted + 1), a_end);
            let after = (before.0 - count, tail(before.1 - count));
            next.push((piece(middle, before), delta(-i64::from(count)), piece(middle, after)));
        }
    }
    if o_end > band.1 {
        let side = piece((band.1 + 1, o_end), (a_start, a_end));
        next.push((side, (0, 0), side));
    }
    next
}

#[cfg(test)]
mod tests {
    use super::*;

    fn r(a: &str, b: &str) -> CellRange {
        CellRange::new(CellAddress::parse(a).unwrap(), CellAddress::parse(b).unwrap())
    }

    #[test]
    fn insert_down_expands_only_the_band_columns() {
        let edit = ShiftEdit::RowInsert { at: 4, count: 1 };
        assert_eq!(band_shift_range(r("B1", "B10"), edit, (1, 1)), vec![r("B1", "B11")]);
        assert_eq!(
            band_shift_range(r("A1", "C10"), edit, (1, 1)),
            vec![r("A1", "A10"), r("B1", "B11"), r("C1", "C10")]
        );
        assert_eq!(band_shift_range(r("B1", "B3"), edit, (1, 1)), vec![r("B1", "B3")]);
    }

    #[test]
    fn whole_axis_pieces_move_their_cells_and_still_cover_the_axis() {
        let insert = ShiftEdit::RowInsert { at: 0, count: 1 };
        assert_eq!(
            band_shift_pieces(r("B1", "B1048576"), insert, (1, 1)),
            vec![(r("B1", "B1048575"), (1, 0), r("B1", "B1048576"))]
        );
        let delete = ShiftEdit::RowDelete { at: 2, count: 2 };
        assert_eq!(
            band_shift_pieces(r("B1", "B1048576"), delete, (1, 1)),
            vec![
                (r("B1", "B2"), (0, 0), r("B1", "B2")),
                (r("B5", "B1048576"), (-2, 0), r("B3", "B1048576")),
            ]
        );
    }

    #[test]
    fn delete_left_shrinks_or_removes_the_band_rows() {
        let edit = ShiftEdit::ColDelete { at: 1, count: 2 };
        assert_eq!(band_shift_range(r("A1", "E1"), edit, (0, 0)), vec![r("A1", "C1")]);
        assert!(band_shift_range(r("B1", "C1"), edit, (0, 0)).is_empty());
        assert_eq!(
            band_shift_range(r("D1", "D3"), edit, (0, 1)),
            vec![r("B1", "B2"), r("D3", "D3")]
        );
    }
}
