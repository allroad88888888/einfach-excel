//! Rust 权威的有限历史；JS 只接收标签、计数与目标范围。
use crate::history_snapshot::HistorySnapshot;
use crate::{CellRange, Workbook};
use std::collections::VecDeque;

const MAX_ENTRIES: usize = 50;
const MAX_BYTES: usize = 32 * 1024 * 1024;

#[derive(Clone, Debug)]
pub struct HistoryEntry {
    pub label: String,
    pub sheet: usize,
    pub range: CellRange,
    before: HistorySnapshot,
    after: HistorySnapshot,
}

struct PendingEdit {
    label: String,
    sheet: usize,
    range: CellRange,
    before: HistorySnapshot,
}

#[derive(Default)]
pub struct WorkbookHistory {
    entries: VecDeque<HistoryEntry>,
    cursor: usize,
    pending: Option<PendingEdit>,
    notice: Option<String>,
}

impl WorkbookHistory {
    pub fn begin(
        &mut self,
        workbook: &Workbook,
        sheet: usize,
        range: CellRange,
        label: &str,
        content: bool,
    ) -> Result<(), &'static str> {
        if self.pending.is_some() {
            return Err("Another history command is pending.");
        }
        if range.start.row > range.end.row
            || range.start.col > range.end.col
            || range.end.row >= 1_048_576
            || range.end.col >= 16_384
        {
            return Err("Invalid history range.");
        }
        let target = workbook
            .sheet(sheet)
            .ok_or("History worksheet no longer exists.")?;
        self.pending = Some(PendingEdit {
            label: label.to_owned(),
            sheet,
            range,
            before: HistorySnapshot::capture(target, range, content),
        });
        Ok(())
    }

    pub fn finish(&mut self, workbook: &mut Workbook, success: bool) -> Result<(), &'static str> {
        let pending = self
            .pending
            .take()
            .ok_or("No history command is pending.")?;
        if !success {
            return pending.before.restore(workbook, pending.sheet);
        }
        let after = HistorySnapshot::capture(
            workbook
                .sheet(pending.sheet)
                .ok_or("History worksheet no longer exists.")?,
            pending.range,
            pending.before.cells.is_some(),
        );
        if pending.before == after {
            return Ok(());
        }
        self.entries.truncate(self.cursor);
        self.entries.push_back(HistoryEntry {
            label: pending.label,
            sheet: pending.sheet,
            range: pending.range,
            before: pending.before,
            after,
        });
        self.notice = None;
        let mut bytes: usize = self.entries.iter().map(entry_bytes).sum();
        while self.entries.len() > MAX_ENTRIES || bytes > MAX_BYTES {
            if let Some(entry) = self.entries.pop_front() {
                bytes -= entry_bytes(&entry);
            }
            self.notice = Some(
                "Older operations were dropped to keep history within its memory limit.".into(),
            );
        }
        self.cursor = self.entries.len();
        Ok(())
    }

    pub fn undo(&mut self, workbook: &mut Workbook) -> Result<bool, &'static str> {
        if self.pending.is_some() {
            return Err("Another history command is pending.");
        }
        if self.cursor == 0 {
            return Ok(false);
        }
        let entry = &self.entries[self.cursor - 1];
        entry.before.restore(workbook, entry.sheet)?;
        self.cursor -= 1;
        Ok(true)
    }

    pub fn redo(&mut self, workbook: &mut Workbook) -> Result<bool, &'static str> {
        if self.pending.is_some() {
            return Err("Another history command is pending.");
        }
        let Some(entry) = self.entries.get(self.cursor) else {
            return Ok(false);
        };
        entry.after.restore(workbook, entry.sheet)?;
        self.cursor += 1;
        Ok(true)
    }

    pub fn clear(&mut self, notice: &str) {
        self.entries.clear();
        self.cursor = 0;
        self.pending = None;
        self.notice = (!notice.is_empty()).then(|| notice.to_owned());
    }

    pub fn undo_count(&self) -> usize {
        self.cursor
    }
    pub fn redo_count(&self) -> usize {
        self.entries.len() - self.cursor
    }
    pub fn entries(&self) -> impl Iterator<Item = &HistoryEntry> {
        self.entries.iter()
    }
    pub fn notice(&self) -> Option<&str> {
        self.notice.as_deref()
    }
}

fn entry_bytes(entry: &HistoryEntry) -> usize {
    entry.before.retained_bytes() + entry.after.retained_bytes() + entry.label.len()
}
