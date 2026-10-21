//! 备注是工作表的独立纯文本元数据，不替代值、公式、格式或线程批注。
use crate::{CellAddress, CellRange, Sheet};

#[cfg(test)]
mod tests;

pub const MAX_NOTE_CHARACTERS: usize = 32767;

/// 保留用户空格及多行，只归一换行；删除必须走显式的 None。
pub fn normalize_note(input: &str) -> Result<String, &'static str> {
    let text = input.replace("\r\n", "\n").replace('\r', "\n");
    if text.trim().is_empty() {
        return Err("Enter note text. Use Delete note to remove an existing note.");
    }
    if text.contains('\0') {
        return Err("Note text cannot contain a null character.");
    }
    if text.chars().count() > MAX_NOTE_CHARACTERS {
        return Err("Note text cannot exceed 32767 characters.");
    }
    Ok(text)
}

impl Sheet {
    pub fn note(&self, addr: CellAddress) -> Option<&str> {
        self.notes.get(&addr).map(String::as_str)
    }

    /// 稀疏枚举保证空白画布上的备注不要求遍历所有坐标。
    pub fn notes_in_range(&self, range: CellRange) -> Vec<(CellAddress, String)> {
        if range.start == range.end {
            return self
                .note(range.start)
                .map(|text| vec![(range.start, text.to_owned())])
                .unwrap_or_default();
        }
        let mut notes: Vec<_> = self
            .notes
            .iter()
            .filter(|(addr, _)| range.contains(**addr))
            .map(|(addr, text)| (*addr, text.clone()))
            .collect();
        notes.sort_by_key(|(addr, _)| (addr.row, addr.col));
        notes
    }

    /// 文件恢复与用户提交共享校验；历史边界由 WorkbookHistory 持有。
    pub fn set_note(
        &mut self,
        addr: CellAddress,
        text: Option<&str>,
    ) -> Result<bool, &'static str> {
        if addr.row >= crate::sheet::EXCEL_MAX_ROWS || addr.col >= crate::sheet::EXCEL_MAX_COLS {
            return Err("The note cell is outside the worksheet.");
        }
        let next = text.map(normalize_note).transpose()?;
        if self.note(addr) == next.as_deref() {
            return Ok(false);
        }
        if let Some(text) = next {
            self.notes.insert(addr, text);
        } else {
            self.notes.remove(&addr);
        }
        Ok(true)
    }

    pub(crate) fn restore_notes(&mut self, range: CellRange, notes: &[(CellAddress, String)]) {
        self.notes.retain(|addr, _| !range.contains(*addr));
        self.notes.extend(notes.iter().cloned());
    }

    /// 插入不得静默挤掉末行/末列的备注；删除带内的备注随格子删除。
    pub(crate) fn validate_note_shift(
        &self,
        edit: crate::shift::ShiftEdit,
    ) -> Result<(), &'static str> {
        use crate::shift::ShiftEdit;
        let (at, count, limit, row) = match edit {
            ShiftEdit::RowInsert { at, count } => (at, count, crate::sheet::EXCEL_MAX_ROWS, true),
            ShiftEdit::ColInsert { at, count } => (at, count, crate::sheet::EXCEL_MAX_COLS, false),
            _ => return Ok(()),
        };
        if count > limit
            || self.notes.keys().any(|addr| {
                let axis = if row { addr.row } else { addr.col };
                axis >= at && axis >= limit - count
            })
        {
            return Err("The insertion would move a note outside the worksheet.");
        }
        Ok(())
    }

    pub(crate) fn shift_notes(&mut self, edit: crate::shift::ShiftEdit) {
        self.notes = std::mem::take(&mut self.notes)
            .into_iter()
            .filter_map(|(addr, text)| {
                let next = edit.apply(addr);
                (next.row < crate::sheet::EXCEL_MAX_ROWS && next.col < crate::sheet::EXCEL_MAX_COLS)
                    .then_some((next, text))
            })
            .collect();
    }
}
