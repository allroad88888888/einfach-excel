//! 本表自定义公式验证随位移改写：锚点跟随内容，被删时先重定到幸存格，再改写带内引用。
use super::*;
use crate::data_validation::{DataValidationKind, DataValidationRule};
use crate::shift::{rewrite_band_shift, shift_copy_formula};
use std::sync::Arc;

impl CellShift {
    /// 与整行插删（`Sheet::shift_data_validations`）同一口径；非公式规则原样共享。
    pub(super) fn shift_validation_rule(
        &self, rule: &Arc<DataValidationRule>, range: CellRange, sheet_name: &str,
    ) -> Arc<DataValidationRule> {
        let DataValidationKind::CustomFormula { formula, anchor } = &rule.kind else {
            return rule.clone();
        };
        let Some(mut expr) = crate::parse_formula(formula) else { return rule.clone() };
        let (origin, next_anchor) = match self.map(*anchor) {
            Some(next) => (*anchor, next),
            None => match self.survivor(range, *anchor) {
                Some(found) => found,
                None => return rule.clone(),
            },
        };
        if origin != *anchor {
            let rows = i64::from(origin.row) - i64::from(anchor.row);
            let cols = i64::from(origin.col) - i64::from(anchor.col);
            if let Ok(rebased) = shift_copy_formula(&expr, rows, cols) { expr = rebased; }
        }
        rewrite_band_shift(&mut expr, sheet_name, true, self.edit, self.band);
        let mut next = (**rule).clone();
        next.kind = DataValidationKind::CustomFormula {
            formula: crate::render_formula(&expr),
            anchor: next_anchor,
        };
        if next == **rule { rule.clone() } else { Arc::new(next) }
    }

    /// 锚点被删时，区域内第一个幸存格：区域起点，或沿位移轴越过删除带的那一格。
    fn survivor(&self, range: CellRange, anchor: CellAddress) -> Option<(CellAddress, CellAddress)> {
        let gone = self.vanishing();
        let past = if self.edit.is_row_edit() {
            CellAddress::new(gone.end.row.saturating_add(1), anchor.col)
        } else {
            CellAddress::new(anchor.row, gone.end.col.saturating_add(1))
        };
        [range.start, past, range.end].into_iter()
            .filter(|cell| range.contains(*cell))
            .find_map(|cell| self.map(cell).map(|next| (cell, next)))
    }
}
