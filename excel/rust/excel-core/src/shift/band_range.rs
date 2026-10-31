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
