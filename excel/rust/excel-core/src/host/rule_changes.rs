//! 从已保留规则前后像提取实际变动的完整作用域，不扫描格子。
use crate::workbook::ConditionalFormatRuleEntry;
use crate::data_validation::DataValidationRegion;
use crate::{CellAddress, CellRange};

pub(crate) fn conditional_ranges(before: &[ConditionalFormatRuleEntry], after: &[ConditionalFormatRuleEntry])
    -> Vec<CellRange>
{
    before.iter().filter(|rule| after.iter().find(|next| next.id == rule.id) != Some(rule))
        .chain(after.iter().filter(|rule| before.iter().find(|old| old.id == rule.id) != Some(rule)))
        .flat_map(|rule| std::iter::once(CellRange::new(
            CellAddress::new(rule.row_start, rule.col_start),
            CellAddress::new(rule.row_end, rule.col_end),
        )).chain(rule.additional_ranges.iter().copied())).collect()
}

pub(crate) fn validation_ranges(before: &[DataValidationRegion], after: &[DataValidationRegion])
    -> Vec<CellRange>
{
    before.iter().filter(|entry| !after.contains(entry))
        .chain(after.iter().filter(|entry| !before.contains(entry)))
        .map(|entry| entry.range).collect()
}
