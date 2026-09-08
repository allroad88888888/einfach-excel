//! Rust 权威的有限历史；JS 只接收标签、计数与目标范围。
use crate::history_snapshot::HistorySnapshot;
use crate::sheet::WorkbookAtomContext;
use crate::workbook::{SheetHistoryChange, StructuralHistoryChange};
use crate::{CellRange, Workbook};
use std::collections::VecDeque;
use std::rc::{Rc, Weak};

#[path = "workbook_history_sheets.rs"]
mod sheets;
#[path = "workbook_history_visibility.rs"]
mod visibility;
use visibility::VisibilityChange;
#[path = "workbook_history_freeze.rs"]
mod freeze;
use freeze::FreezeChange;
#[path = "workbook_history_entry.rs"]
mod entry;
use entry::entry_bytes;
#[path = "workbook_history_merge.rs"]
mod merge;
#[path = "workbook_history_structure.rs"]
mod structure;
use merge::MergeChange;

const MAX_ENTRIES: usize = 50;
const MAX_BYTES: usize = 32 * 1024 * 1024;

#[derive(Debug)]
pub struct HistoryEntry {
    pub label: String,
    pub sheet: usize,
    pub range: CellRange,
    pub sheet_key: u64,
    pub sheet_name: String,
    pub affected_keys: Vec<u64>,
    affected_indices: Vec<usize>,
    origin: Weak<WorkbookAtomContext>,
    change: HistoryChange,
}

#[derive(Debug)]
enum HistoryChange {
    Cells {
        before: Vec<(usize, HistorySnapshot)>,
        after: Vec<(usize, HistorySnapshot)>,
    },
    Sheet(Box<SheetHistoryChange>),
    Visibility(VisibilityChange),
    Freeze(FreezeChange),
    Structure(Box<StructuralHistoryChange>),
    Merge(Box<MergeChange>),
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
        self.begin_ranges(
            workbook,
            sheet,
            range,
            label,
            &[(sheet, range, content)],
            false,
        )
    }

    /// 多范围仍是一条用户操作，范围由原生命令的预检结果提供。
    pub(crate) fn begin_ranges(
        &mut self,
        workbook: &Workbook,
        sheet: usize,
        range: CellRange,
        label: &str,
        targets: &[(usize, CellRange, bool)],
        merges: bool,
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
                .map(|(index, range, content)| {
                    (
                        *index,
                        HistorySnapshot::capture_with_merges(
                            workbook.sheet(*index).unwrap(),
                            *range,
                            *content,
                            merges && *index == sheet,
                        ),
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
                    HistorySnapshot::capture_with_merges(
                        target,
                        before.range,
                        before.cells.is_some(),
                        before.merges.is_some(),
                    ),
                ))
            })
            .collect::<Result<Vec<_>, &'static str>>()?;
        if pending.before == after {
            return Ok(());
        }
        let affected_indices: Vec<_> = pending
            .before
            .iter()
            .map(|(sheet, _)| *sheet)
            .collect::<std::collections::BTreeSet<_>>()
            .into_iter()
            .collect();
        self.push(HistoryEntry {
            label: pending.label,
            sheet: pending.sheet,
            range: pending.range,
            sheet_key: workbook.sheet_key(pending.sheet).unwrap(),
            sheet_name: workbook.name(pending.sheet).unwrap().to_owned(),
            affected_keys: affected_indices
                .iter()
                .map(|index| workbook.sheet_key(*index).unwrap())
                .collect(),
            affected_indices,
            origin: Rc::downgrade(&workbook.atom_context),
            change: HistoryChange::Cells {
                before: pending.before,
                after,
            },
        });
        Ok(())
    }

    fn push(&mut self, entry: HistoryEntry) {
        self.entries.truncate(self.cursor);
        self.entries.push_back(entry);
        self.cursor = self.entries.len();
        self.notice = None;
        self.enforce_budget();
    }

    fn enforce_budget(&mut self) {
        let mut bytes: usize = self.entries.iter().map(entry_bytes).sum();
        while self.entries.len() > MAX_ENTRIES || bytes > MAX_BYTES {
            if self.cursor == 0 {
                // 不留下缺少前置步骤的 redo 尾巴。
                self.entries.clear();
                bytes = 0;
            } else if let Some(entry) = self.entries.pop_front() {
                bytes -= entry_bytes(&entry);
                self.cursor -= 1;
            }
            self.notice = Some(
                "Older operations were dropped to keep history within its memory limit.".into(),
            );
        }
    }

    pub fn undo(&mut self, workbook: &mut Workbook) -> Result<bool, &'static str> {
        if self.pending.is_some() {
            return Err("Another history command is pending.");
        }
        if self.cursor == 0 {
            return Ok(false);
        }
        self.entries[self.cursor - 1].apply(workbook, true)?;
        self.cursor -= 1;
        self.enforce_budget();
        Ok(true)
    }

    pub fn redo(&mut self, workbook: &mut Workbook) -> Result<bool, &'static str> {
        if self.pending.is_some() {
            return Err("Another history command is pending.");
        }
        let Some(entry) = self.entries.get_mut(self.cursor) else {
            return Ok(false);
        };
        entry.apply(workbook, false)?;
        self.cursor += 1;
        self.enforce_budget();
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
    pub fn is_pending(&self) -> bool {
        self.pending.is_some()
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
