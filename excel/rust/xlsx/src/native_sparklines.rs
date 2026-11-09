//! 迷你图组（插件 `plugin-sparkline` 的格内对象）：`refs = [位置, 数据]`，载荷是整组设置。
//! 位置是一行或一列；位置一列时数据按行切给每格，一行时按列切（与插件同一规则）。

use crate::native_drawings::NativeRange;

pub const SPARKLINE_KIND: &str = "sparkline";

fn height(range: &NativeRange) -> u32 { range.end_row - range.start_row + 1 }
fn width(range: &NativeRange) -> u32 { range.end_col - range.start_col + 1 }

/// 每格 `(行, 列, 该格的数据区域)`；位置与数据对不上返回 None。
pub fn slots(location: &NativeRange, data: &NativeRange) -> Option<Vec<(u32, u32, NativeRange)>> {
    if height(location) > 1 && width(location) > 1 {
        return None;
    }
    let count = height(location).max(width(location));
    let vertical = height(location) > 1;
    let by_rows = height(data) == count && (count > 1 || height(data) == 1);
    let by_cols = width(data) == count && (count > 1 || width(data) == 1);
    let use_rows = if vertical { by_rows || !by_cols } else { !by_cols && by_rows };
    if !(if use_rows { by_rows } else { by_cols }) {
        return None;
    }
    Some((0..count).map(|i| {
        let (row, col) = if vertical { (location.start_row + i, location.start_col) } else { (location.start_row, location.start_col + i) };
        let mut slice = data.clone();
        if use_rows {
            slice.start_row = data.start_row + i;
            slice.end_row = slice.start_row;
        } else {
            slice.start_col = data.start_col + i;
            slice.end_col = slice.start_col;
        }
        (row, col, slice)
    }).collect())
}
