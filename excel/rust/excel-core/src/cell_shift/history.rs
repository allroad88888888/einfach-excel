//! 插入/删除单元格进入同一条 Rust 历史栈；拒绝时内容、历史游标保持不变。
use super::*;
use crate::workbook::{CellShiftChange, CellShiftDirection};

impl WorkbookHistory {
    pub fn shift_cells(
        &mut self,
        workbook: &mut Workbook,
        sheet: usize,
        range: CellRange,
        direction: CellShiftDirection,
    ) -> Result<bool, &'static str> {
        if self.pending.is_some() {
            return Err("Another history command is pending.");
        }
        validate_target(workbook, sheet, range)?;
        let change = CellShiftChange::prepare(workbook, sheet, range, direction)?;
        change.apply(workbook, false)?;
        let affected_indices = change.affected_sheets(workbook);
        self.push(HistoryEntry {
            label: direction.label().to_owned(),
            sheet,
            range: change.shift.selection,
            sheet_key: workbook.sheet_key(sheet).unwrap(),
            sheet_name: workbook.name(sheet).unwrap().to_owned(),
            affected_keys: affected_indices
                .iter()
                .map(|index| workbook.sheet_key(*index).unwrap())
                .collect(),
            affected_indices,
            origin: Rc::downgrade(&workbook.atom_context),
            change: HistoryChange::CellShift(Box::new(change)),
        });
        Ok(true)
    }
}
