//! 每张工作表的冻结边界：两个计数，不创建单元格或参与公式计算。
use super::*;
use crate::shift::ShiftEdit;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct FrozenPanes {
    pub rows: u32,
    pub cols: u32,
}

impl Sheet {
    pub fn frozen_panes(&self) -> FrozenPanes {
        self.frozen_panes
    }

    /// 冻结边界之后至少保留一个可滚动的原生行列。
    pub fn set_frozen_panes(&mut self, freeze: FrozenPanes) -> Result<bool, &'static str> {
        if freeze.rows >= EXCEL_MAX_ROWS || freeze.cols >= EXCEL_MAX_COLS {
            return Err("Freeze boundary is outside the worksheet.");
        }
        let changed = self.frozen_panes != freeze;
        self.frozen_panes = freeze;
        Ok(changed)
    }

    /// 只在冻结带内部插删时移动边界；恰好在边界插入仍属于滚动区域。
    pub(super) fn shift_frozen_panes(&mut self, edit: ShiftEdit) {
        let (at, count, insert) = match edit {
            ShiftEdit::RowInsert { at, count } | ShiftEdit::ColInsert { at, count } => {
                (at, count, true)
            }
            ShiftEdit::RowDelete { at, count } | ShiftEdit::ColDelete { at, count } => {
                (at, count, false)
            }
        };
        let (band, limit) = if edit.is_row_edit() {
            (&mut self.frozen_panes.rows, EXCEL_MAX_ROWS)
        } else {
            (&mut self.frozen_panes.cols, EXCEL_MAX_COLS)
        };
        if at < *band {
            *band = if insert {
                band.saturating_add(count).min(limit - 1)
            } else {
                *band - count.min(*band - at)
            };
        }
    }
}
