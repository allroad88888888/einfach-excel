//! 插删行列时对象随锚点格移动，数据引用随区域伸缩；删光的引用变成 `None`。
use super::{DrawingRange, SheetDrawing};
use crate::shift::{shift_interval, ShiftEdit};
use crate::sheet::{EXCEL_MAX_COLS, EXCEL_MAX_ROWS};
use crate::Sheet;

fn edit_parts(edit: ShiftEdit) -> (u32, u32, bool, u32) {
    match edit {
        ShiftEdit::RowInsert { at, count } => (at, count, true, EXCEL_MAX_ROWS),
        ShiftEdit::RowDelete { at, count } => (at, count, false, EXCEL_MAX_ROWS),
        ShiftEdit::ColInsert { at, count } => (at, count, true, EXCEL_MAX_COLS),
        ShiftEdit::ColDelete { at, count } => (at, count, false, EXCEL_MAX_COLS),
    }
}

/// 锚点在被删带内时停在删除线上并清零该轴偏移，与 Excel「随单元格移动」一致；插入挤出末行则停在末行。
fn shift_anchor(index: u32, offset: u32, edit: ShiftEdit) -> (u32, u32) {
    let (at, count, insert, limit) = edit_parts(edit);
    if index < at || count == 0 {
        return (index, offset);
    }
    if insert {
        return (index.saturating_add(count).min(limit - 1), offset);
    }
    let cut_end = at.saturating_add(count);
    if index < cut_end {
        return (at.min(limit - 1), 0);
    }
    (index - count, offset)
}

fn shift_range(range: DrawingRange, edit: ShiftEdit) -> Option<DrawingRange> {
    let (at, count, insert, limit) = edit_parts(edit);
    let mut next = range;
    if edit.is_row_edit() {
        (next.start_row, next.end_row) =
            shift_interval(range.start_row, range.end_row, at, count, insert, limit)?;
    } else {
        (next.start_col, next.end_col) =
            shift_interval(range.start_col, range.end_col, at, count, insert, limit)?;
    }
    Some(next)
}

pub(crate) fn shifted_drawing(drawing: &SheetDrawing, edit: ShiftEdit) -> SheetDrawing {
    let mut next = drawing.clone();
    let anchor = &mut next.anchor;
    if edit.is_row_edit() {
        (anchor.row, anchor.offset_y) = shift_anchor(anchor.row, anchor.offset_y, edit);
    } else {
        (anchor.col, anchor.offset_x) = shift_anchor(anchor.col, anchor.offset_x, edit);
    }
    next.refs = drawing
        .refs
        .iter()
        .map(|range| range.and_then(|range| shift_range(range, edit)))
        .collect();
    next
}

impl Sheet {
    pub(crate) fn shift_drawings(&mut self, edit: ShiftEdit) {
        for drawing in &mut self.drawings {
            *drawing = shifted_drawing(drawing, edit);
        }
    }
}
