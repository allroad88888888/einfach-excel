//! 把一个区域换算成依赖分层用的几何量（Tier 判定、行带、列键）。
//!
//! 拆自 `sheet.rs`，是 `sheet` 的子模块 —— 照旧看得见 `Sheet` 的私有字段与私有
//! 方法。原来的私有项在这里写成 `pub(super)`，覆盖范围与它们留在 `sheet.rs`
//! 里时逐字相同。

use super::*;

pub(super) const RANGE_TIER_A_CELL_LIMIT: u64 = 256;

pub(super) const RANGE_BAND_ROWS: u32 = 256;

pub(super) const RANGE_BAND_DEP_LIMIT: u64 = 4_096;

pub(super) const RANGE_COLUMN_DEP_LIMIT: u64 = 4_096;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub(super) struct RangeBandKey {
    pub(super) col: u32,
    pub(super) row_band: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub(super) struct RangeColumnKey {
    pub(super) col: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) struct RangeGeometryBounds {
    pub(super) start_row: u32,
    pub(super) end_row: u32,
    pub(super) start_col: u32,
    pub(super) end_col: u32,
}

pub(super) fn clamp_range_axis_end(value: u32, max_len: u32) -> u32 {
    if value == u32::MAX {
        max_len - 1
    } else {
        value.min(max_len - 1)
    }
}

pub(super) fn range_geometry_bounds(range: CellRange) -> RangeGeometryBounds {
    let n = range.normalize();
    RangeGeometryBounds {
        start_row: n.start.row.min(EXCEL_MAX_ROWS - 1),
        end_row: clamp_range_axis_end(n.end.row, EXCEL_MAX_ROWS),
        start_col: n.start.col.min(EXCEL_MAX_COLS - 1),
        end_col: clamp_range_axis_end(n.end.col, EXCEL_MAX_COLS),
    }
}

pub(super) fn inclusive_span_u64(start: u32, end: u32) -> u64 {
    if end < start {
        0
    } else {
        u64::from(end - start) + 1
    }
}

pub(super) fn range_cell_count_u64(range: CellRange) -> u64 {
    let bounds = range_geometry_bounds(range);
    let rows = inclusive_span_u64(bounds.start_row, bounds.end_row);
    let cols = inclusive_span_u64(bounds.start_col, bounds.end_col);
    rows.saturating_mul(cols)
}

pub(super) fn range_row_band(row: u32) -> u32 {
    row / RANGE_BAND_ROWS
}

pub(super) fn range_band_count_u64(range: CellRange) -> u64 {
    let bounds = range_geometry_bounds(range);
    let cols = inclusive_span_u64(bounds.start_col, bounds.end_col);
    let start_band = range_row_band(bounds.start_row);
    let end_band = range_row_band(bounds.end_row);
    let bands = inclusive_span_u64(start_band, end_band);
    cols.saturating_mul(bands)
}

pub(super) fn range_band_key_for_addr(addr: CellAddress) -> RangeBandKey {
    RangeBandKey {
        col: addr.col,
        row_band: range_row_band(addr.row),
    }
}
