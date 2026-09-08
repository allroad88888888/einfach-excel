//! 只粘贴列宽：按列平铺元数据，不扫描/改写单元格，也不触及行高。
use super::*;
use crate::workbook_history::WorkbookHistory;

impl Workbook {
    pub(super) fn paste_column_widths(
        &mut self,
        snapshot: &ClipboardSnapshot,
        sheet_idx: usize,
        range: CellRange,
        mut history: Option<&mut WorkbookHistory>,
    ) -> Result<CellRange, ClipboardError> {
        if snapshot.column_widths.len() != snapshot.cols() as usize {
            return Err("CLIPBOARD_NO_FORMATS");
        }
        if let Some(history) = history.as_deref_mut() {
            history.begin(self, sheet_idx, range, "Paste column widths", false)?;
        }
        let sheet = self.sheet_mut(sheet_idx).unwrap();
        for col in range.start.col..=range.end.col {
            let width =
                snapshot.column_widths[((col - range.start.col) % snapshot.cols()) as usize];
            // set_col_width(0) 清除目标覆盖，让默认宽度也能正确复制。
            sheet.set_col_width(col, width.unwrap_or(0));
        }
        if let Some(history) = history {
            history.finish(self, true)?;
        }
        Ok(range)
    }
}
