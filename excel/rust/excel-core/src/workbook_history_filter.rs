//! 筛选历史只保存当前表的条件与隐藏集合；撤销不重新计算条件。
use super::*;
use crate::filter::SheetAutoFilter;
use crate::{CellAddress, ColumnFilterRule, FilterApplyReport, FilterError};

#[derive(Debug)]
pub(super) struct FilterChange {
    before: Option<SheetAutoFilter>,
    after: Option<SheetAutoFilter>,
}

impl FilterChange {
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
        let state = if undo { &self.before } else { &self.after };
        let (rules, hidden) = state
            .as_ref()
            .map(|state| (state.rules().to_vec(), state.hidden_set().clone()))
            .unwrap_or_default();
        if workbook
            .sheet_mut(sheet)
            .unwrap()
            .commit_filter(rules, hidden)
        {
            workbook.republish_hidden(sheet);
        }
        Ok(())
    }

    pub(super) fn retained_bytes(&self) -> usize {
        self.before
            .iter()
            .chain(self.after.iter())
            .map(|state| {
                state.hidden_set().len() * 32
                    + state
                        .rules()
                        .iter()
                        .map(|rule| {
                            std::mem::size_of::<ColumnFilterRule>()
                                + match rule {
                                    ColumnFilterRule::Equals { value, .. }
                                    | ColumnFilterRule::Contains { value, .. } => value.len(),
                                    ColumnFilterRule::List { values, .. } => {
                                        values.iter().map(|value| value.len() + 24).sum()
                                    }
                                    ColumnFilterRule::Range { .. } => 0,
                                }
                        })
                        .sum::<usize>()
            })
            .sum()
    }
}

impl WorkbookHistory {
    pub fn apply_filter(
        &mut self,
        workbook: &mut Workbook,
        sheet: usize,
        rules: &[ColumnFilterRule],
    ) -> Result<FilterApplyReport, FilterError> {
        self.change_filter(workbook, sheet, "Apply filter", |book| {
            book.apply_filter(sheet, rules)
        })
    }

    pub fn reapply_filter(
        &mut self,
        workbook: &mut Workbook,
        sheet: usize,
    ) -> Result<FilterApplyReport, FilterError> {
        self.change_filter(workbook, sheet, "Reapply filter", |book| {
            book.reapply_filter(sheet)
        })
    }

    pub fn clear_filter(
        &mut self,
        workbook: &mut Workbook,
        sheet: usize,
    ) -> Result<FilterApplyReport, FilterError> {
        self.change_filter(workbook, sheet, "Clear filter", |book| {
            book.clear_filter(sheet)
        })
    }

    fn change_filter(
        &mut self,
        workbook: &mut Workbook,
        sheet: usize,
        label: &str,
        write: impl FnOnce(&mut Workbook) -> Result<FilterApplyReport, FilterError>,
    ) -> Result<FilterApplyReport, FilterError> {
        if self.pending.is_some() {
            return Err(FilterError::HistoryPending);
        }
        let before = workbook
            .sheet(sheet)
            .ok_or(FilterError::InvalidSheet)?
            .filter()
            .cloned();
        let report = write(workbook)?;
        let after = workbook.sheet(sheet).unwrap().filter().cloned();
        if before != after {
            let key = workbook.sheet_key(sheet).unwrap();
            self.push(HistoryEntry {
                label: label.to_owned(),
                sheet,
                sheet_key: key,
                range: CellRange::single(CellAddress::new(0, 0)),
                sheet_name: workbook.name(sheet).unwrap().to_owned(),
                affected_keys: vec![key],
                affected_indices: vec![sheet],
                origin: Rc::downgrade(&workbook.atom_context),
                change: HistoryChange::Filter(FilterChange { before, after }),
            });
        }
        Ok(report)
    }
}
