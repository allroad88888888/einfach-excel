//! 拖动选区边框移动／复制：复用原生剪切／复制粘贴事务，不占用用户的剪贴板快照。

use crate::clipboard::{ClipboardError, ClipboardPasteOptions};
use crate::workbook_history::WorkbookHistory;
use crate::{CellAddress, CellRange, Workbook};
use einfach_core::Value;

/// 目标区已有内容且调用方尚未确认替换。
pub const DRAG_TARGET_NOT_EMPTY: ClipboardError = "DRAG_TARGET_NOT_EMPTY";
/// 落点与来源相同，没有任何可写的变化。
pub const DRAG_TARGET_UNCHANGED: ClipboardError = "DRAG_TARGET_UNCHANGED";

#[derive(Clone, Copy, Debug)]
pub struct DragTransfer {
    pub source: CellRange,
    /// 目标区左上角；尺寸始终等于来源。
    pub target: CellAddress,
    /// true 为复制（相对引用平移），false 为移动（引用跟随被移动的格）。
    pub copy: bool,
    /// 已确认覆盖目标区的已有内容。
    pub replace: bool,
    pub row_count: u32,
    pub col_count: u32,
}

impl DragTransfer {
    /// 目标矩形；越出工作表时拒绝，不截断。
    pub fn destination(&self) -> Result<CellRange, ClipboardError> {
        let end_row = u64::from(self.target.row) + u64::from(self.source.rows()) - 1;
        let end_col = u64::from(self.target.col) + u64::from(self.source.cols()) - 1;
        if end_row >= u64::from(self.row_count) || end_col >= u64::from(self.col_count) {
            return Err("CLIPBOARD_OUTSIDE_SHEET");
        }
        Ok(CellRange::new(
            self.target,
            CellAddress::new(end_row as u32, end_col as u32),
        ))
    }
}

impl Workbook {
    /// 一次原生事务：移动＝剪切后粘贴，复制＝复制后粘贴；保护、合并、Table 与引用改写同粘贴。
    pub fn drag_transfer(
        &mut self,
        sheet_idx: usize,
        transfer: &DragTransfer,
        history: Option<&mut WorkbookHistory>,
    ) -> Result<CellRange, ClipboardError> {
        if transfer.target == transfer.source.start {
            return Err(DRAG_TARGET_UNCHANGED);
        }
        let destination = transfer.destination()?;
        if !transfer.replace {
            // 移动时来源格会先被清空，所以与来源重叠的部分不算“已有数据”。
            let vacated = (!transfer.copy).then_some(transfer.source);
            if self.has_content(sheet_idx, destination, vacated)? {
                return Err(DRAG_TARGET_NOT_EMPTY);
            }
        }
        let snapshot = self.capture_clipboard(sheet_idx, transfer.source, !transfer.copy)?;
        let options = ClipboardPasteOptions {
            row_count: transfer.row_count,
            col_count: transfer.col_count,
            ..ClipboardPasteOptions::new(CellRange::single(transfer.target))
        };
        match history {
            Some(history) => {
                self.paste_clipboard_with_history(&snapshot, sheet_idx, &options, history)
            }
            None => self.paste_clipboard(&snapshot, sheet_idx, &options),
        }
    }

    /// 只看值和公式；仅有格式的空格不算数据，与 Excel 的覆盖提示一致。
    fn has_content(
        &self,
        sheet_idx: usize,
        range: CellRange,
        except: Option<CellRange>,
    ) -> Result<bool, ClipboardError> {
        let sheet = self.sheet(sheet_idx).ok_or("CLIPBOARD_INVALID_SHEET")?;
        Ok(range.iter().any(|addr| {
            !except.is_some_and(|skip| skip.contains(addr))
                && (sheet.formula_text_at(addr).is_some()
                    || !matches!(sheet.peek_value(addr), Value::Null))
        }))
    }
}

#[cfg(test)]
mod tests;
