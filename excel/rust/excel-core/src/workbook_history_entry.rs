//! 一条历史记录的身份检查、回放分派及内存估算。
use super::*;

impl HistoryEntry {
    /// 剪切可能改写其它表的公式；权限检查必须看到全部受影响的表。
    pub fn affected_sheets(&self) -> Vec<usize> {
        self.affected_indices.clone()
    }

    pub fn is_sheet_change(&self) -> bool {
        matches!(self.change, HistoryChange::Sheet(_))
    }

    /// 宿主只据此调整画布/选区；数据与历史快照不跨出 Rust。
    pub fn structural_edit(&self) -> Option<crate::shift::ShiftEdit> {
        match &self.change {
            HistoryChange::Structure(change) => Some(change.edit),
            _ => None,
        }
    }

    pub fn removes_sheet(&self, undo: bool) -> bool {
        matches!(&self.change, HistoryChange::Sheet(change)
            if matches!(change.as_ref(), SheetHistoryChange::Presence { created, .. } if *created == undo))
    }

    pub(super) fn apply(
        &mut self,
        workbook: &mut Workbook,
        undo: bool,
    ) -> Result<(), &'static str> {
        if !self
            .origin
            .upgrade()
            .is_some_and(|origin| Rc::ptr_eq(&origin, &workbook.atom_context))
        {
            return Err("History belongs to a different workbook.");
        }
        if matches!(
            self.change,
            HistoryChange::Cells { .. } | HistoryChange::Structure(_)
        ) {
            for (index, key) in self.affected_indices.iter().zip(&self.affected_keys) {
                if workbook.sheet_key(*index) != Some(*key) {
                    return Err("The worksheet changed outside history.");
                }
            }
        }
        match &mut self.change {
            HistoryChange::Cells { before, after } => {
                workbook.restore_history_snapshots(if undo { before } else { after })
            }
            HistoryChange::Sheet(change) => change.apply(workbook, undo),
            HistoryChange::Visibility(change) => {
                change.apply(workbook, self.sheet, self.sheet_key, undo)
            }
            HistoryChange::Structure(change) => change.apply(workbook, self.sheet, undo),
        }
    }
}

pub(super) fn entry_bytes(entry: &HistoryEntry) -> usize {
    let payload = match &entry.change {
        HistoryChange::Cells { before, after } => before
            .iter()
            .chain(after)
            .map(|(_, snapshot)| snapshot.retained_bytes())
            .sum(),
        HistoryChange::Sheet(change) => change.retained_bytes(),
        HistoryChange::Visibility(change) => change.retained_bytes(),
        HistoryChange::Structure(change) => change.retained_bytes(),
    };
    payload + entry.label.len() + entry.sheet_name.len() + entry.affected_keys.len() * 16 + 128
}
