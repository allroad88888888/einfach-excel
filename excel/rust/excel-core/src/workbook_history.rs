//! Rust 权威的有限历史；JS 只接收标签、计数与目标范围。
use crate::history_snapshot::HistorySnapshot;
use crate::sheet::WorkbookAtomContext;
use crate::workbook::{SheetHistoryChange, StructuralHistoryChange, TableEntry};
use crate::{CellRange, Workbook};
use std::collections::VecDeque;
use std::rc::{Rc, Weak};

#[path = "workbook_history_cells.rs"]
mod cells;
#[path = "workbook_history_dimensions.rs"]
mod dimensions;
use dimensions::CellDimensionChanges;
#[path = "workbook_history_sheets.rs"]
mod sheets;
#[path = "workbook_history_visibility.rs"]
mod visibility;
use visibility::VisibilityChange;
#[path = "workbook_history_freeze.rs"]
mod freeze;
use freeze::FreezeChange;
#[path = "workbook_history_outline.rs"]
mod outline;
use outline::OutlineChange;
#[path = "workbook_history_filter.rs"]
mod filter;
use filter::FilterChange;
#[path = "workbook_history_conditional_format.rs"]
mod conditional_format;
use conditional_format::ConditionalFormatChange;
#[path = "comments/history.rs"]
mod comments;
#[path = "custom_formulas/history.rs"]
mod custom_formulas;
#[path = "workbook_history_data_validation.rs"]
mod data_validation;
#[path = "hyperlink/history.rs"]
mod hyperlink;
#[path = "workbook_history_input.rs"]
mod input;
#[path = "workbook_history_named_range.rs"]
mod named_range;
#[path = "notes/history.rs"]
mod notes;
#[path = "protection/history.rs"]
mod protection;
#[path = "workbook_history_table.rs"]
mod table;
use data_validation::DataValidationChange;
#[path = "workbook_history_entry.rs"]
mod entry;
use entry::entry_bytes;
#[path = "workbook_history_borders.rs"]
mod borders;
#[path = "workbook_history_clear.rs"]
mod clear;
#[path = "workbook_history_format.rs"]
mod format;
pub use clear::ClearSelectionMode;
#[path = "workbook_history_merge.rs"]
mod merge;
#[path = "workbook_history_replace.rs"]
mod replace;
pub use replace::ReplaceReport;
#[path = "workbook_history_remove_duplicates.rs"]
mod remove_duplicates;
#[path = "workbook_history_structure.rs"]
mod structure;
#[path = "workbook_history_text_columns.rs"]
mod text_columns;
use merge::MergeChange;

const MAX_ENTRIES: usize = 50;
pub(crate) const MAX_BYTES: usize = 32 * 1024 * 1024;

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
        table_rows: Vec<TableEntry>,
        dimensions: CellDimensionChanges,
    },
    Sheet(Box<SheetHistoryChange>),
    Visibility(VisibilityChange),
    Freeze(FreezeChange),
    Outline(OutlineChange),
    Filter(FilterChange),
    ConditionalFormat(ConditionalFormatChange),
    DataValidation(DataValidationChange),
    Structure(Box<StructuralHistoryChange>),
    NamedRange(Box<crate::workbook::NamedRangeChange>),
    CustomFormula(Box<crate::custom_formulas::CustomFormulaChange>),
    TableCreate(Box<crate::workbook::TableCreation>),
    TableDefinition(Box<crate::workbook::TableDefinitionChange>),
    Merge(Box<MergeChange>),
}

struct PendingEdit {
    label: String,
    sheet: usize,
    range: CellRange,
    before: Vec<(usize, HistorySnapshot)>,
    table_rows: Vec<TableEntry>,
    dimension_generations: std::collections::BTreeMap<usize, [u64; 2]>,
}

#[derive(Default)]
pub struct WorkbookHistory {
    entries: VecDeque<HistoryEntry>,
    cursor: usize,
    pending: Option<PendingEdit>,
    notice: Option<String>,
}

impl WorkbookHistory {
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
