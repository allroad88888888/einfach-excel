//! 隐藏行列进入原生历史，只保存隐藏索引，不为一个可见性操作复制单元格。
use super::*;
use crate::workbook::SheetVisibility;
use std::collections::BTreeSet;

#[derive(Debug)]
pub(super) struct VisibilityChange {
    before: SheetVisibility,
    after: SheetVisibility,
}

impl VisibilityChange {
    pub(super) fn apply(
        &self,
        workbook: &mut Workbook,
        sheet: usize,
        key: u64,
        undo: bool,
    ) -> Result<(), &'static str> {
        if workbook.sheet_key(sheet) != Some(key) {
            return Err("The worksheet changed outside history.");
        }
        workbook.restore_sheet_visibility(sheet, if undo { &self.before } else { &self.after })
    }

    pub(super) fn retained_bytes(&self) -> usize {
        4 * (self.before.rows.len()
            + self.before.columns.len()
            + self.after.rows.len()
            + self.after.columns.len())
    }
}

impl WorkbookHistory {
    /// 完整预检后写入；恢复只清除所选范围，传全表范围即可恢复全部手动隐藏行列。
    pub fn set_visibility(
        &mut self,
        workbook: &mut Workbook,
        sheet: usize,
        range: CellRange,
        action: &str,
    ) -> Result<bool, &'static str> {
        if self.pending.is_some() {
            return Err("Another history command is pending.");
        }
        validate_target(workbook, sheet, range)?;
        let label = match action {
            "hide-rows" => "Hide rows",
            "hide-columns" => "Hide columns",
            "unhide" => "Unhide rows and columns",
            _ => return Err("Invalid visibility action."),
        };
        let before = workbook.sheet_visibility(sheet)?;
        let mut rows: BTreeSet<_> = before.rows.iter().copied().collect();
        let mut columns: BTreeSet<_> = before.columns.iter().copied().collect();
        match action {
            "hide-rows" => rows.extend(range.start.row..=range.end.row),
            "hide-columns" => columns.extend(range.start.col..=range.end.col),
            _ => {
                rows.retain(|row| *row < range.start.row || *row > range.end.row);
                columns.retain(|col| *col < range.start.col || *col > range.end.col);
            }
        }
        let after = SheetVisibility {
            rows: rows.into_iter().collect(),
            columns: columns.into_iter().collect(),
        };
        if before == after {
            return Ok(false);
        }
        workbook.restore_sheet_visibility(sheet, &after)?;
        let key = workbook.sheet_key(sheet).unwrap();
        self.push(HistoryEntry {
            label: label.to_owned(),
            sheet,
            range,
            sheet_key: key,
            sheet_name: workbook.name(sheet).unwrap().to_owned(),
            affected_keys: vec![key],
            affected_indices: vec![sheet],
            origin: Rc::downgrade(&workbook.atom_context),
            change: HistoryChange::Visibility(VisibilityChange { before, after }),
        });
        Ok(true)
    }
}
