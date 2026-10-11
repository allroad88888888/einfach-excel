//! 名称 CRUD 使用现有有限原生历史栈；拒绝与无操作不消费 redo。
use super::*;
use crate::workbook::{NamedRangeAction, NamedRangeChange};
use crate::CellAddress;

impl WorkbookHistory {
    pub fn change_named_range(
        &mut self,
        workbook: &mut Workbook,
        active_sheet: usize,
        action: NamedRangeAction,
    ) -> Result<bool, &'static str> {
        if self.pending.is_some() || workbook.is_inside_custom_call() {
            return Err("Another history command is pending.");
        }
        let sheet_key = workbook
            .sheet_key(active_sheet)
            .ok_or("The worksheet no longer exists.")?;
        let Some(change) = NamedRangeChange::prepare(workbook, action)? else {
            return Ok(false);
        };
        let affected_indices = change.affected_sheets(workbook, active_sheet);
        change.apply(workbook, false)?;
        self.push(HistoryEntry {
            label: change.label().into(),
            sheet: active_sheet,
            range: CellRange::single(CellAddress::new(0, 0)),
            sheet_key,
            sheet_name: workbook.name(active_sheet).unwrap().into(),
            affected_keys: affected_indices
                .iter()
                .map(|index| workbook.sheet_key(*index).unwrap())
                .collect(),
            affected_indices,
            origin: Rc::downgrade(&workbook.atom_context),
            change: HistoryChange::NamedRange(Box::new(change)),
        });
        Ok(true)
    }
}
