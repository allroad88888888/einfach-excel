//! 冻结命令的原生历史仅保留前后两个边界，不复制单元格快照。
use super::*;
use crate::{CellAddress, FrozenPanes};

#[derive(Debug)]
pub(super) struct FreezeChange {
    before: FrozenPanes,
    after: FrozenPanes,
}

impl FreezeChange {
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
        workbook
            .sheet_mut(sheet)
            .unwrap()
            .set_frozen_panes(if undo { self.before } else { self.after })?;
        Ok(())
    }
}

impl WorkbookHistory {
    pub fn set_frozen_panes(
        &mut self,
        workbook: &mut Workbook,
        sheet: usize,
        freeze: FrozenPanes,
    ) -> Result<bool, &'static str> {
        if self.pending.is_some() || workbook.is_inside_custom_call() {
            return Err("Another history command is pending.");
        }
        let before = workbook
            .sheet(sheet)
            .ok_or("The worksheet no longer exists.")?
            .frozen_panes();
        if !workbook
            .sheet_mut(sheet)
            .unwrap()
            .set_frozen_panes(freeze)?
        {
            return Ok(false);
        }
        let key = workbook.sheet_key(sheet).unwrap();
        self.push(HistoryEntry {
            label: if freeze == FrozenPanes::default() {
                "Unfreeze panes"
            } else {
                "Freeze panes"
            }
            .to_owned(),
            sheet,
            range: CellRange::single(CellAddress::new(freeze.rows, freeze.cols)),
            sheet_key: key,
            sheet_name: workbook.name(sheet).unwrap().to_owned(),
            affected_keys: vec![key],
            affected_indices: vec![sheet],
            origin: Rc::downgrade(&workbook.atom_context),
            change: HistoryChange::Freeze(FreezeChange {
                before,
                after: freeze,
            }),
        });
        Ok(true)
    }
}
