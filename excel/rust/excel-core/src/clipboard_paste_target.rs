//! 粘贴范围预检：整倍数平铺、尺寸上限、受保护区域一次判定。

use super::*;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum ClipboardPasteMode {
    #[default]
    All,
    Values,
    Formats,
}

pub struct ClipboardPasteOptions {
    pub selection: CellRange,
    pub mode: ClipboardPasteMode,
    pub row_count: u32,
    pub col_count: u32,
    pub unlocked_ranges: Option<Vec<CellRange>>,
}

impl ClipboardPasteOptions {
    pub fn new(selection: CellRange) -> Self {
        Self {
            selection,
            mode: ClipboardPasteMode::All,
            row_count: crate::sheet::EXCEL_MAX_ROWS,
            col_count: crate::sheet::EXCEL_MAX_COLS,
            unlocked_ranges: None,
        }
    }
}

impl ClipboardSnapshot {
    /// 单格落下原尺寸；多格必须正好容纳整数份，不能只贴一部分。
    pub(super) fn paste_target(
        &self,
        options: &ClipboardPasteOptions,
    ) -> Result<CellRange, ClipboardError> {
        let selection = options.selection;
        validate_range(selection)?;
        if self.cut && options.mode != ClipboardPasteMode::All {
            return Err("CLIPBOARD_CUT_SPECIAL");
        }
        if options.mode == ClipboardPasteMode::Formats && self.source_sheet.is_none() {
            return Err("CLIPBOARD_NO_FORMATS");
        }
        let range = if selection.rows() == 1 && selection.cols() == 1 {
            CellRange::new(
                selection.start,
                CellAddress::new(
                    selection
                        .start
                        .row
                        .checked_add(self.rows() - 1)
                        .ok_or("CLIPBOARD_INVALID_RANGE")?,
                    selection
                        .start
                        .col
                        .checked_add(self.cols() - 1)
                        .ok_or("CLIPBOARD_INVALID_RANGE")?,
                ),
            )
        } else {
            if selection.rows() % self.rows() != 0
                || selection.cols() % self.cols() != 0
                || (self.cut
                    && (selection.rows() != self.rows() || selection.cols() != self.cols()))
            {
                return Err("CLIPBOARD_SELECTION_SIZE");
            }
            selection
        };
        validate_range(range)?;
        if range.end.row >= options.row_count || range.end.col >= options.col_count {
            return Err("CLIPBOARD_OUTSIDE_SHEET");
        }
        if let Some(unlocked) = &options.unlocked_ranges {
            let allowed = |addr| unlocked.iter().any(|range| range.contains(addr));
            if !range.iter().all(allowed) || (self.cut && !self.source.iter().all(allowed)) {
                return Err("CLIPBOARD_LOCKED");
            }
        }
        Ok(range)
    }
}
