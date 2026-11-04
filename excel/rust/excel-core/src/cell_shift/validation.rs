//! 本表自定义公式验证随位移改写：按位移拆成同质块，每块各自换算锚点与公式。
use super::*;
use crate::shift::{band_shift_pieces, rewrite_band_shift};

impl CellShift {
    pub(super) fn shift_validation_region(
        &self, region: &DataValidationRegion, sheet_name: &str,
    ) -> Vec<DataValidationRegion> {
        band_shift_pieces(region.range, self.edit, self.band).into_iter()
            .map(|(before, delta, range)| DataValidationRegion {
                range,
                rule: region.rule.for_shifted_piece(before, delta,
                    |expr| rewrite_band_shift(expr, sheet_name, true, self.edit, self.band)),
            })
            .collect()
    }
}
