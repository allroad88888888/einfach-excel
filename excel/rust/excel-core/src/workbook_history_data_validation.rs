//! 数据验证配置的原生历史；规则共享不可变内容，不捕获区域内单元格。
use super::*;
use crate::data_validation::{DataValidationRegion, DataValidationRule};

#[derive(Debug)]
pub(super) struct DataValidationChange {
    before: Vec<DataValidationRegion>,
    after: Vec<DataValidationRegion>,
}

impl DataValidationChange {
    pub(super) fn apply(
        &self,
        workbook: &mut Workbook,
        sheet: usize,
        key: u64,
        undo: bool,
    ) -> Result<(), &'static str> {
        if workbook.is_inside_custom_call() || workbook.sheet_key(sheet) != Some(key) {
            return Err("The worksheet changed outside history.");
        }
        let target = workbook.sheet_mut(sheet).unwrap();
        let expected = if undo { &self.after } else { &self.before };
        if target.data_validations() != expected {
            return Err("Data validation changed outside history.");
        }
        target
            .data_validations
            .clone_from(if undo { &self.before } else { &self.after });
        Ok(())
    }

    pub(super) fn retained_bytes(&self) -> usize {
        crate::sheet::metadata_bytes(&self.before) + crate::sheet::metadata_bytes(&self.after)
    }
}

impl WorkbookHistory {
    pub fn set_data_validation(
        &mut self,
        workbook: &mut Workbook,
        sheet: usize,
        range: CellRange,
        rule: Option<DataValidationRule>,
    ) -> Result<(), &'static str> {
        if self.pending.is_some() || workbook.is_inside_custom_call() {
            return Err("Another history command is pending.");
        }
        validate_target(workbook, sheet, range)?;
        let target = workbook.sheet_mut(sheet).unwrap();
        let before = target.data_validations().to_vec();
        let clearing = rule.is_none();
        target.set_data_validation(range, rule)?;
        let after = target.data_validations().to_vec();
        if before == after {
            return Ok(());
        }
        let key = workbook.sheet_key(sheet).unwrap();
        self.push(HistoryEntry {
            label: if clearing {
                "Clear data validation"
            } else {
                "Set data validation"
            }
            .into(),
            sheet,
            range,
            sheet_key: key,
            sheet_name: workbook.name(sheet).unwrap().to_owned(),
            affected_keys: vec![key],
            affected_indices: vec![sheet],
            origin: Rc::downgrade(&workbook.atom_context),
            change: HistoryChange::DataValidation(DataValidationChange { before, after }),
        });
        Ok(())
    }
}
