//! 插入/删除单元格的拒绝条件；任何写入或历史变化之前完成。
use super::*;

pub(super) const MERGE_ERROR: &str = "Cannot shift cells through part of a merged cell.";
pub(super) const TABLE_ERROR: &str =
    "Cannot shift cells in a table. Insert or delete table rows or columns instead.";
pub(super) const SPILL_ERROR: &str = "Cannot shift part of a spilled array.";
pub(super) const FILTER_ERROR: &str = "Cannot shift cells inside a filtered range.";
pub(super) const OFF_SHEET_ERROR: &str =
    "Cannot shift nonblank cells off the worksheet. Clear the last cells first.";

/// 不可拆的矩形（合并格、溢出数组）必须整块随带移动：
/// 与受影响矩形相交就必须完整落在其中，删除时与被删区相交就必须整块被删，
/// 插入时不能被推出画布。
fn rect_moves_whole(shift: &CellShift, rect: CellRange) -> bool {
    let area = shift.area();
    if !rect.intersects(area) {
        return true;
    }
    if !(area.contains(rect.start) && area.contains(rect.end)) {
        return false;
    }
    let vanishing = shift.vanishing();
    if shift.is_insert() {
        return !rect.intersects(vanishing);
    }
    !rect.intersects(vanishing) || (vanishing.contains(rect.start) && vanishing.contains(rect.end))
}

impl Workbook {
    pub(super) fn validate_cell_shift(&self, sheet: usize, shift: &CellShift) -> Result<(), &'static str> {
        if self.is_inside_custom_call() {
            return Err("Cannot shift cells during a custom call.");
        }
        let target = self.sheet(sheet).ok_or("The worksheet no longer exists.")?;
        let selection = shift.selection;
        if selection.end.row >= EXCEL_MAX_ROWS || selection.end.col >= EXCEL_MAX_COLS {
            return Err("Invalid cell range.");
        }
        // 与插删行列一致：只要求目标工作表未保护，带外引用照常改写。
        self.ensure_sheet_unprotected(sheet)?;
        if target.merged_ranges().iter().any(|merged| !rect_moves_whole(shift, *merged)) {
            return Err(MERGE_ERROR);
        }
        let area = shift.area();
        let name = self.name(sheet).unwrap();
        if self.tables.values().any(|table| table.sheet_name == name && table.range.intersects(area)) {
            return Err(TABLE_ERROR);
        }
        for anchor in target.spill_anchor_addr.values().copied() {
            let (rows, cols) = target.spill_info(anchor).unwrap_or((1, 1));
            let spilled = CellRange::new(
                anchor,
                CellAddress::new(anchor.row + rows.max(1) - 1, anchor.col + cols.max(1) - 1),
            );
            if !rect_moves_whole(shift, spilled) {
                return Err(SPILL_ERROR);
            }
        }
        if target.filter().and_then(|filter| filter.range()).is_some_and(|range| range.intersects(area)) {
            return Err(FILTER_ERROR);
        }
        Ok(())
    }
}
