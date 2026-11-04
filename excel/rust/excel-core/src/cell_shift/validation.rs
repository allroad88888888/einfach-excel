//! 本表自定义公式验证随位移改写：区域拆分后每一块以自身起点为锚点，与整行插删同一求值口径。
use super::*;
use crate::shift::{band_shift_range, rewrite_band_shift};

impl CellShift {
    pub(super) fn shift_validation_region(
        &self, region: &DataValidationRegion, sheet_name: &str,
    ) -> Vec<DataValidationRegion> {
        band_shift_range(region.range, self.edit, self.band).into_iter().map(|range| {
            let rule = region.rule.rebased_for_piece(self.preimage(range.start), range.start,
                |expr| rewrite_band_shift(expr, sheet_name, true, self.edit, self.band));
            DataValidationRegion { range, rule }
        }).collect()
    }

    /// 位移后位置在位移前的位置；位移带外的格不动。
    fn preimage(&self, addr: CellAddress) -> CellAddress {
        if !self.area().contains(addr) { return addr; }
        let count = self.count();
        let back = |value: u32| if self.is_insert() { value - count } else { value + count };
        if self.edit.is_row_edit() {
            CellAddress::new(back(addr.row), addr.col)
        } else {
            CellAddress::new(addr.row, back(addr.col))
        }
    }
}
