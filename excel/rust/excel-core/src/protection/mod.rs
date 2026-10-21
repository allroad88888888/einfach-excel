//! Password-free worksheet editing protection. This is not a confidentiality boundary.
mod coverage;
mod structure;

use crate::{CellAddress, CellRange, Workbook};
use serde::{Deserialize, Serialize};

pub const MAX_UNLOCKED_RANGES: usize = 256;
pub const PROTECTED_ERROR: &str = "This worksheet is protected. Unprotect it before changing locked cells.";

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProtectionMode {
    #[default]
    Open,
    Protected,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProtectionRange {
    pub row_start: u32,
    pub row_end: u32,
    pub col_start: u32,
    pub col_end: u32,
}

impl ProtectionRange {
    pub fn validate(self) -> Result<(), &'static str> {
        if self.row_start > self.row_end || self.col_start > self.col_end
            || self.row_end >= 1_048_576 || self.col_end >= 16_384
        {
            return Err("The editable range is outside the worksheet.");
        }
        Ok(())
    }

    pub fn cell_range(self) -> CellRange {
        CellRange::new(CellAddress::new(self.row_start, self.col_start),
            CellAddress::new(self.row_end, self.col_end))
    }
}

impl From<CellRange> for ProtectionRange {
    fn from(range: CellRange) -> Self {
        Self { row_start: range.start.row, row_end: range.end.row,
            col_start: range.start.col, col_end: range.end.col }
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SheetProtection {
    pub mode: ProtectionMode,
    pub unlocked_ranges: Vec<ProtectionRange>,
}

impl SheetProtection {
    pub fn validate(&self) -> Result<(), &'static str> {
        if self.unlocked_ranges.len() > MAX_UNLOCKED_RANGES {
            return Err("A worksheet supports at most 256 editable ranges.");
        }
        self.unlocked_ranges.iter().try_for_each(|range| range.validate())
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "action", rename_all = "kebab-case", deny_unknown_fields)]
pub enum ProtectionChange {
    Protect,
    Unprotect,
    AllowRange { range: ProtectionRange },
    RemoveRange { index: usize },
}

impl Workbook {
    pub fn read_protection(&self, sheet: usize) -> Result<SheetProtection, &'static str> {
        let key = self.sheet_key(sheet).ok_or("The worksheet no longer exists.")?;
        Ok(self.protection.get(&key).cloned().unwrap_or_default())
    }

    /// Settings bypass content history deliberately; unprotect preserves the configured ranges.
    pub fn change_protection(&mut self, sheet: usize, change: ProtectionChange)
        -> Result<bool, &'static str>
    {
        if self.is_inside_custom_call() {
            return Err("Another mutation is in progress.");
        }
        let key = self.sheet_key(sheet).ok_or("The worksheet no longer exists.")?;
        let before = self.read_protection(sheet)?;
        let mut next = before.clone();
        match change {
            ProtectionChange::Protect => next.mode = ProtectionMode::Protected,
            ProtectionChange::Unprotect => next.mode = ProtectionMode::Open,
            ProtectionChange::AllowRange { range } => {
                self.ensure_sheet_unprotected(sheet)?;
                range.validate()?;
                if !next.unlocked_ranges.contains(&range) { next.unlocked_ranges.push(range); }
            }
            ProtectionChange::RemoveRange { index } => {
                self.ensure_sheet_unprotected(sheet)?;
                if index >= next.unlocked_ranges.len() {
                    return Err("The editable range no longer exists.");
                }
                next.unlocked_ranges.remove(index);
            }
        }
        next.validate()?;
        if next == before { return Ok(false); }
        self.protection.insert(key, next);
        Ok(true)
    }

    /// Every addressed cell must be editable; a mixed rectangle is rejected atomically.
    pub fn ensure_range_editable(&self, sheet: usize, range: CellRange)
        -> Result<(), &'static str>
    {
        let target = ProtectionRange::from(range);
        target.validate()?;
        let state = self.read_protection(sheet)?;
        if state.mode == ProtectionMode::Open
            || coverage::fully_covered(target, &state.unlocked_ranges)
        { Ok(()) } else { Err(PROTECTED_ERROR) }
    }

    /// Metadata and geometry remain locked even when their cells are in an editable range.
    pub fn ensure_sheet_unprotected(&self, sheet: usize) -> Result<(), &'static str> {
        if self.read_protection(sheet)?.mode == ProtectionMode::Protected {
            Err(PROTECTED_ERROR)
        } else { Ok(()) }
    }

    /// Names/topology can rewrite other sheets, so they require all sheets to be open.
    pub fn ensure_workbook_unprotected(&self) -> Result<(), &'static str> {
        (0..self.sheet_count()).try_for_each(|sheet| self.ensure_sheet_unprotected(sheet))
    }

    /// Called only on a fresh, fully restored workbook before it replaces the live one.
    pub fn restore_protection(&mut self, entries: Vec<(usize, SheetProtection)>)
        -> Result<(), &'static str>
    {
        let mut next = std::collections::BTreeMap::new();
        for (sheet, state) in entries {
            let key = self.sheet_key(sheet).ok_or("Protection refers to a missing worksheet.")?;
            state.validate()?;
            if next.insert(key, state).is_some() {
                return Err("Duplicate worksheet protection configuration.");
            }
        }
        self.protection = next;
        Ok(())
    }
}
