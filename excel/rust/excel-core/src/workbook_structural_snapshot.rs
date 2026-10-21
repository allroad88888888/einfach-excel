//! 结构事务的稀疏快照：只保存指定带与实际变化的目录，不持有求值结果。
use super::*;
use crate::filter::SheetAutoFilter;
use crate::history_snapshot::HistorySnapshot;

#[derive(Debug)]
pub(super) struct StructuralSnapshot {
    pub(super) cells: Vec<(usize, HistorySnapshot)>,
    pub(super) visibility: SheetVisibility,
    pub(super) filter: Option<SheetAutoFilter>,
    pub(super) tables: Vec<TableEntry>,
    pub(super) merges: Vec<CellRange>,
    pub(super) freeze: crate::FrozenPanes,
    pub(super) outline: crate::outline::SheetOutline,
    pub(super) data_validations: Vec<crate::data_validation::DataValidationRegion>,
    pub(super) referenced_validations: Vec<(usize, Vec<crate::data_validation::DataValidationRegion>)>,
    pub(super) conditional_formats: Vec<(usize, Vec<ConditionalFormatRuleEntry>)>,
}

impl StructuralSnapshot {
    pub(super) fn capture(
        workbook: &Workbook,
        sheet: usize,
        targets: &[(usize, CellRange)],
        rule_sheets: &[usize],
        validation_sheets: &[usize],
    ) -> Self {
        Self {
            cells: targets.iter().map(|(index, range)| {
                (*index, HistorySnapshot::capture(&workbook.sheets[*index], *range, true))
            }).collect(),
            visibility: workbook.sheet_visibility(sheet).unwrap(),
            merges: workbook.sheets[sheet].merged_ranges().to_vec(),
            freeze: workbook.sheets[sheet].frozen_panes(),
            outline: workbook.sheets[sheet].outline.clone(),
            data_validations: workbook.sheets[sheet].data_validations.clone(),
            referenced_validations: validation_sheets.iter()
                .map(|&index| (index, workbook.sheets[index].data_validations.clone())).collect(),
            conditional_formats: rule_sheets.iter()
                .map(|&index| (index, workbook.conditional_formats[index].rules.clone())).collect(),
            filter: workbook.sheets[sheet].filter().cloned(),
            tables: workbook.tables.values()
                .filter(|table| Some(table.sheet_name.as_str()) == workbook.name(sheet))
                .cloned().collect(),
        }
    }

    pub(super) fn retained_bytes(&self) -> usize {
        self.cells.iter().map(|(_, snapshot)| snapshot.retained_bytes()).sum::<usize>()
            + crate::sheet::metadata_bytes(&self.visibility)
            + crate::sheet::metadata_bytes(&self.filter)
            + crate::sheet::metadata_bytes(&self.tables)
            + self.merges.len() * std::mem::size_of::<CellRange>()
            + std::mem::size_of::<crate::FrozenPanes>()
            + crate::sheet::metadata_bytes(&self.outline)
            + crate::sheet::metadata_bytes(&self.conditional_formats)
            + crate::sheet::metadata_bytes(&self.data_validations)
            + crate::sheet::metadata_bytes(&self.referenced_validations)
    }
}
