//! Scan populated cells covered by data-validation rules for Circle Invalid Data.
use super::*;
use crate::data_validation::DataValidationKind;
use crate::sheet::collapse_array_for_eval;
use std::collections::BTreeMap;

pub const MAX_INVALID_VALIDATION_CIRCLES: usize = 1000;

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InvalidValidationCell {
    pub row: u32,
    pub col: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InvalidValidationReport {
    pub cells: Vec<InvalidValidationCell>,
    pub truncated: bool,
}

impl Workbook {
    /// Lists populated cells on `sheet` whose current values violate their active
    /// data-validation rule. Matches Excel's Circle Invalid Data semantics: truly
    /// blank cells (no formula and `Value::Null`) are never circled, so whole-column
    /// rules remain O(populated cells). Results are returned in deterministic
    /// row-major order, bounded by `max_count.clamp(1, MAX_INVALID_VALIDATION_CIRCLES)`.
    pub fn list_invalid_validation_cells(
        &self,
        sheet: usize,
        max_count: usize,
    ) -> Result<InvalidValidationReport, &'static str> {
        let target = self.sheet(sheet).ok_or("INVALID_SHEET")?;
        let regions = target.data_validations().to_vec();
        if regions.is_empty() {
            return Ok(InvalidValidationReport {
                cells: Vec::new(),
                truncated: false,
            });
        }
        let limit = max_count.clamp(1, MAX_INVALID_VALIDATION_CIRCLES);
        let parsed_formulas: Vec<Option<crate::formula::Expr>> = regions
            .iter()
            .map(|region| match &region.rule.kind {
                DataValidationKind::CustomFormula { formula, .. } => parse_formula(formula.trim()),
                _ => None,
            })
            .collect();

        // Regions in `data_validations` are pairwise disjoint; collect populated cells
        // in deterministic row-major order via BTreeMap keyed by (row, col).
        let mut populated: BTreeMap<(u32, u32), (usize, Value)> = BTreeMap::new();
        for (region_idx, region) in regions.iter().enumerate() {
            self.for_each_sparse_range_cell(sheet, region.range, |addr, value| {
                let value = collapse_array_for_eval(value);
                let has_formula = self
                    .sheet(sheet)
                    .is_some_and(|s| s.has_formula_at(addr));
                if !has_formula && matches!(value, Value::Null) {
                    return;
                }
                populated.entry((addr.row, addr.col)).or_insert((region_idx, value));
            });
        }

        let mut cells = Vec::new();
        let mut truncated = false;
        for ((row, col), (region_idx, value)) in populated {
            let addr = CellAddress::new(row, col);
            let rule = &regions[region_idx].rule;
            let blank = matches!(value, Value::Null)
                || matches!(&value, Value::Text(text) if text.is_empty());
            let accepted = match &rule.kind {
                DataValidationKind::CustomFormula { anchor, .. } => {
                    (blank && rule.ignore_blank)
                        || parsed_formulas[region_idx].as_ref().is_some_and(|expr| {
                            formula::accepts_parsed(self, sheet, addr, *anchor, expr)
                        })
                }
                _ => rule.accepts(&value),
            };
            if !accepted {
                if cells.len() >= limit {
                    truncated = true;
                    break;
                }
                cells.push(InvalidValidationCell { row, col });
            }
        }
        Ok(InvalidValidationReport { cells, truncated })
    }
}
