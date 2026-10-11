//! 局部插行的矩形几何：左右保留，中间位移；不访问单元格或规则内容。
use crate::{CellRange, sheet::EXCEL_MAX_ROWS};

pub(crate) fn insert_row_band_range(
    bounds: CellRange, row: u32, columns: (u32, u32), row_count: u32,
) -> Result<Vec<CellRange>, ()> {
    if bounds.end.row < row || bounds.end.col < columns.0 || bounds.start.col > columns.1
        || (bounds.start.row == 0 && bounds.end.row == EXCEL_MAX_ROWS - 1) {
        return Ok(vec![bounds]);
    }
    if bounds.end.row + 1 >= row_count { return Err(()); }
    let mut next = Vec::with_capacity(3);
    if bounds.start.col < columns.0 {
        let mut left = bounds;
        left.end.col = columns.0 - 1;
        next.push(left);
    }
    let mut moved = bounds;
    moved.start.col = bounds.start.col.max(columns.0);
    moved.end.col = bounds.end.col.min(columns.1);
    if moved.start.row >= row { moved.start.row += 1; }
    moved.end.row += 1;
    next.push(moved);
    if bounds.end.col > columns.1 {
        let mut right = bounds;
        right.start.col = columns.1 + 1;
        next.push(right);
    }
    Ok(next)
}
