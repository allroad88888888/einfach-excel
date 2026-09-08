//! 行列插删进入同一条 Rust 历史栈；失败或零数量不消耗 redo。
use super::*;
use crate::shift::ShiftEdit;

impl WorkbookHistory {
    pub fn edit_structure(
        &mut self,
        workbook: &mut Workbook,
        sheet: usize,
        edit: ShiftEdit,
    ) -> Result<bool, &'static str> {
        if self.pending.is_some() {
            return Err("Another history command is pending.");
        }
        let Some((change, range)) = StructuralHistoryChange::edit(workbook, sheet, edit)? else {
            return Ok(false);
        };
        let affected_indices = change.affected_sheets();
        self.push(HistoryEntry {
            label: match edit {
                ShiftEdit::RowInsert { .. } => "Insert rows",
                ShiftEdit::RowDelete { .. } => "Delete rows",
                ShiftEdit::ColInsert { .. } => "Insert columns",
                ShiftEdit::ColDelete { .. } => "Delete columns",
            }
            .to_owned(),
            sheet,
            range,
            sheet_key: workbook.sheet_key(sheet).unwrap(),
            sheet_name: workbook.name(sheet).unwrap().to_owned(),
            affected_keys: affected_indices
                .iter()
                .map(|index| workbook.sheet_key(*index).unwrap())
                .collect(),
            affected_indices,
            origin: Rc::downgrade(&workbook.atom_context),
            change: HistoryChange::Structure(Box::new(change)),
        });
        Ok(true)
    }
}
