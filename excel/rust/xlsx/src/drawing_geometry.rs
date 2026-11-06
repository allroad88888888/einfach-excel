//! 浮动对象锚点（行列 + 像素偏移 + 像素尺寸）与 DrawingML 锚点（行列 + EMU 偏移）互转。
//! 行高列宽按原生文件的显式尺寸、工作表默认值与引擎默认值取，隐藏行列宽高为 0，
//! 与界面实际绘制一致；导入、导出共用这一份换算。

use std::collections::{BTreeMap, BTreeSet};

use crate::native::Persistence;

/// 1 CSS 像素 = 9525 EMU（914400 EMU/英寸 ÷ 96）。
pub const EMU_PER_PX: u64 = 9525;
/// 与引擎、界面一致的兜底尺寸（sheet_format_write.rs、publishWorkbookOperationAtom）。
const ENGINE_ROW_PX: u32 = 28;
const ENGINE_COL_PX: u32 = 120;

/// DrawingML 的一个角：`xdr:from` / `xdr:to`。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CellCorner {
    pub col: u32,
    pub col_off_emu: u64,
    pub row: u32,
    pub row_off_emu: u64,
}

/// 一张表的行高列宽（像素）。
#[derive(Debug, Clone, Default)]
pub struct SheetGeometry {
    rows: BTreeMap<u32, u32>,
    cols: BTreeMap<u32, u32>,
    hidden_rows: BTreeSet<u32>,
    hidden_cols: BTreeSet<u32>,
    default_row: u32,
    default_col: u32,
}

impl SheetGeometry {
    pub fn from_native(workbook: &Persistence, sheet: usize) -> Self {
        let meta = workbook.sheets.iter().find(|meta| meta.idx as usize == sheet);
        let defaults = meta.map(|meta| meta.defaults).unwrap_or_default();
        let mut geometry = Self {
            default_row: defaults.row_height.unwrap_or(ENGINE_ROW_PX),
            default_col: defaults.col_width.unwrap_or(ENGINE_COL_PX),
            ..Self::default()
        };
        for range in workbook.sizes.iter().filter(|range| range.sheet.unwrap_or(0) as usize == sheet) {
            for row in &range.row_heights { geometry.rows.insert(row.row_index, row.height_px); }
            for col in &range.col_widths { geometry.cols.insert(col.col_index, col.width_px); }
        }
        for hidden in workbook.hidden.iter().filter(|hidden| hidden.sheet as usize == sheet) {
            geometry.hidden_rows.extend(&hidden.rows);
        }
        for hidden in workbook.hidden_columns.iter().filter(|hidden| hidden.sheet == sheet) {
            geometry.hidden_cols.extend(&hidden.columns);
        }
        geometry
    }

    pub fn row_px(&self, row: u32) -> u32 {
        if self.hidden_rows.contains(&row) { 0 } else { *self.rows.get(&row).unwrap_or(&self.default_row) }
    }

    pub fn col_px(&self, col: u32) -> u32 {
        if self.hidden_cols.contains(&col) { 0 } else { *self.cols.get(&col).unwrap_or(&self.default_col) }
    }

    /// 锚点 → (from, to)。`to` 落在右下角所在的格；跨越的行列按实际尺寸累加。
    pub fn to_corners(&self, anchor: &crate::native_drawings::NativeAnchor) -> (CellCorner, CellCorner) {
        let from = CellCorner { col: anchor.col, col_off_emu: px_to_emu(anchor.offset_x),
            row: anchor.row, row_off_emu: px_to_emu(anchor.offset_y) };
        let (col, col_off) = walk(anchor.col, anchor.offset_x + anchor.width, |c| self.col_px(c));
        let (row, row_off) = walk(anchor.row, anchor.offset_y + anchor.height, |r| self.row_px(r));
        (from, CellCorner { col, col_off_emu: px_to_emu(col_off), row, row_off_emu: px_to_emu(row_off) })
    }

    /// (from, to) → 锚点（twoCellAnchor）。尺寸为两角之间的像素距离，至少 1px。
    pub fn from_corners(&self, from: CellCorner, to: CellCorner) -> crate::native_drawings::NativeAnchor {
        let span = |start: u32, start_off: u64, end: u32, end_off: u64, size: &dyn Fn(u32) -> u32| {
            let cells: u64 = (start..end).map(|index| u64::from(size(index))).sum();
            (cells + emu_to_px_u64(end_off)).saturating_sub(emu_to_px_u64(start_off)).max(1) as u32
        };
        crate::native_drawings::NativeAnchor {
            row: from.row,
            col: from.col,
            offset_x: emu_to_px(from.col_off_emu),
            offset_y: emu_to_px(from.row_off_emu),
            width: span(from.col, from.col_off_emu, to.col, to.col_off_emu, &|c| self.col_px(c)),
            height: span(from.row, from.row_off_emu, to.row, to.row_off_emu, &|r| self.row_px(r)),
        }
    }
}

/// 从 `start` 格左（上）边起走 `distance` 像素，返回落点所在格与格内偏移。
fn walk(start: u32, distance: u32, size: impl Fn(u32) -> u32) -> (u32, u32) {
    let (mut index, mut left) = (start, distance);
    // 上限防止全隐藏的行列让循环跑到表外。
    while index < start.saturating_add(16_384) {
        let px = size(index);
        if left < px { return (index, left); }
        left -= px;
        index += 1;
    }
    (index, left)
}

pub fn px_to_emu(px: u32) -> u64 { u64::from(px) * EMU_PER_PX }

pub fn emu_to_px(emu: u64) -> u32 { emu_to_px_u64(emu).min(u64::from(u32::MAX)) as u32 }

fn emu_to_px_u64(emu: u64) -> u64 { (emu + EMU_PER_PX / 2) / EMU_PER_PX }

#[cfg(test)]
mod tests {
    use super::*;
    use crate::native_drawings::NativeAnchor;

    fn geometry() -> SheetGeometry {
        let mut g = SheetGeometry { default_row: 20, default_col: 64, ..SheetGeometry::default() };
        g.cols.insert(1, 100);
        g.hidden_rows.insert(2);
        g
    }

    #[test]
    fn corners_walk_real_sizes_and_skip_hidden_rows() {
        let anchor = NativeAnchor { row: 1, col: 0, offset_x: 10, offset_y: 5, width: 200, height: 30 };
        let (from, to) = geometry().to_corners(&anchor);
        assert_eq!(from, CellCorner { col: 0, col_off_emu: 10 * EMU_PER_PX, row: 1, row_off_emu: 5 * EMU_PER_PX });
        // 10 + 200 = 210 = 64（A）+ 100（B）+ 46 → C 格内 46px。
        assert_eq!((to.col, to.col_off_emu), (2, 46 * EMU_PER_PX));
        // 5 + 30 = 35 = 20（第 2 行）+ 0（隐藏的第 3 行）+ 15 → 第 4 行内 15px。
        assert_eq!((to.row, to.row_off_emu), (3, 15 * EMU_PER_PX));
        assert_eq!(geometry().from_corners(from, to), anchor);
    }
}
