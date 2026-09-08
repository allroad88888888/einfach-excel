//! 粘贴范围预检：整倍数平铺、尺寸上限、受保护区域一次判定。

use super::*;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum ClipboardPasteMode {
    #[default]
    All,
    Values,
    ValuesAndFormats,
    Formats,
    Formulas,
    FormulasAndNumberFormats,
    ValuesAndNumberFormats,
}

impl ClipboardPasteMode {
    /// 外部 TSV 没有源格式；不能拿目标格式伪装成复制到的格式。
    pub(super) fn requires_source_formats(self) -> bool {
        matches!(
            self,
            Self::Formats
                | Self::ValuesAndFormats
                | Self::FormulasAndNumberFormats
                | Self::ValuesAndNumberFormats
        )
    }
}

pub struct ClipboardPasteOptions {
    pub selection: CellRange,
    pub mode: ClipboardPasteMode,
    pub transpose: bool,
    pub skip_blanks: bool,
    pub row_count: u32,
    pub col_count: u32,
    pub unlocked_ranges: Option<Vec<CellRange>>,
}

impl ClipboardPasteOptions {
    pub fn new(selection: CellRange) -> Self {
        Self {
            selection,
            mode: ClipboardPasteMode::All,
            transpose: false,
            skip_blanks: false,
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
        if self.cut
            && (options.mode != ClipboardPasteMode::All || options.transpose || options.skip_blanks)
        {
            return Err("CLIPBOARD_CUT_SPECIAL");
        }
        if options.mode.requires_source_formats() && self.source_sheet.is_none() {
            return Err("CLIPBOARD_NO_FORMATS");
        }
        let (rows, cols) = if options.transpose {
            (self.cols(), self.rows())
        } else {
            (self.rows(), self.cols())
        };
        let range = if selection.rows() == 1 && selection.cols() == 1 {
            CellRange::new(
                selection.start,
                CellAddress::new(
                    selection
                        .start
                        .row
                        .checked_add(rows - 1)
                        .ok_or("CLIPBOARD_INVALID_RANGE")?,
                    selection
                        .start
                        .col
                        .checked_add(cols - 1)
                        .ok_or("CLIPBOARD_INVALID_RANGE")?,
                ),
            )
        } else {
            if selection.rows() % rows != 0
                || selection.cols() % cols != 0
                || (self.cut && (selection.rows() != rows || selection.cols() != cols))
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
            let targets_allowed = range.iter().all(|addr| {
                let (_, cell) = self.cell_at_target(addr, range, options.transpose);
                (options.skip_blanks && cell.is_blank()) || allowed(addr)
            });
            if !targets_allowed || (self.cut && !self.source.iter().all(allowed)) {
                return Err("CLIPBOARD_LOCKED");
            }
        }
        Ok(range)
    }

    /// 目标坐标反查源格：先按转置后的块尺寸取模，再交换偏移；预检与写入共用。
    pub(super) fn cell_at_target(
        &self,
        addr: CellAddress,
        target: CellRange,
        transpose: bool,
    ) -> (CellAddress, &ClipboardCell) {
        let (row, col) = if transpose {
            (
                (addr.col - target.start.col) % self.rows(),
                (addr.row - target.start.row) % self.cols(),
            )
        } else {
            (
                (addr.row - target.start.row) % self.rows(),
                (addr.col - target.start.col) % self.cols(),
            )
        };
        (
            CellAddress::new(self.source.start.row + row, self.source.start.col + col),
            &self.cells[(row * self.cols() + col) as usize],
        )
    }
}
