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
    before: Vec<(usize, HistorySnapshot)>,
    after: Vec<(usize, HistorySnapshot)>,
}

impl HistoryEntry {
    /// 剪切可能改写其它表的公式；权限检查必须看到全部受影响的表。
    pub fn affected_sheets(&self) -> Vec<usize> {
        self.before
            .iter()
            .map(|(sheet, _)| *sheet)
            .collect::<std::collections::BTreeSet<_>>()
            .into_iter()
            .collect()
    }
}

struct PendingEdit {
    label: String,
    sheet: usize,
    range: CellRange,
    before: Vec<(usize, HistorySnapshot)>,
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
        self.begin_ranges(workbook, sheet, range, label, &[(sheet, range, content)])
    }

    /// 多范围仍是一条用户操作，范围由原生命令的预检结果提供。
    pub(crate) fn begin_ranges(
        &mut self,
        workbook: &Workbook,
        sheet: usize,
        range: CellRange,
        label: &str,
        targets: &[(usize, CellRange, bool)],
    ) -> Result<(), &'static str> {
        if self.pending.is_some() {
            return Err("Another history command is pending.");
        }
        validate_target(workbook, sheet, range)?;
        for (sheet, range, _) in targets {
            validate_target(workbook, *sheet, *range)?;
        }
        self.pending = Some(PendingEdit {
            label: label.to_owned(),
            sheet,
            range,
            before: targets
                .iter()
                .map(|(sheet, range, content)| {
                    (
                        *sheet,
                        HistorySnapshot::capture(workbook.sheet(*sheet).unwrap(), *range, *content),
                    )
                })
                .collect(),
        });
        Ok(())
    }

    pub fn finish(&mut self, workbook: &mut Workbook, success: bool) -> Result<(), &'static str> {
        let pending = self
            .pending
            .take()
            .ok_or("No history command is pending.")?;
        if !success {
            return workbook.restore_history_snapshots(&pending.before);
        }
        let after = pending
            .before
            .iter()
            .map(|(sheet, before)| {
                let target = workbook
                    .sheet(*sheet)
                    .ok_or("History worksheet no longer exists.")?;
                Ok((
                    *sheet,
                    HistorySnapshot::capture(target, before.range, before.cells.is_some()),
                ))
            })
            .collect::<Result<Vec<_>, &'static str>>()?;
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
        workbook.restore_history_snapshots(&entry.before)?;
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
        workbook.restore_history_snapshots(&entry.after)?;
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
    entry
        .before
        .iter()
        .chain(&entry.after)
        .map(|(_, snapshot)| snapshot.retained_bytes())
        .sum::<usize>()
        + entry.label.len()
}

fn validate_target(
    workbook: &Workbook,
    sheet: usize,
    range: CellRange,
) -> Result<(), &'static str> {
    if workbook.sheet(sheet).is_none() {
        return Err("History worksheet no longer exists.");
    }
    if range.start.row > range.end.row
        || range.start.col > range.end.col
        || range.end.row >= 1_048_576
        || range.end.col >= 16_384
    {
        return Err("Invalid history range.");
    }
    Ok(())
}
