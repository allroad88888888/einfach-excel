//! 插删行列时对象随锚点格移动，数据引用随区域伸缩；删光的引用变成 `None`。
use super::{DrawingRange, SheetDrawing};
use crate::sheet::{EXCEL_MAX_COLS, EXCEL_MAX_ROWS};
use crate::shift::{shift_interval, ShiftEdit};
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
    // 跨表引用指向别的表，对象所在表的编辑不动它。
    next.refs = drawing
        .refs
        .iter()
        .map(|range| match range {
            Some(range) if range.sheet.is_none() => shift_range(*range, edit),
            other => *other,
        })
        .collect();
    next
}

/// 数据表 `key` 被编辑：只平移指向它的跨表引用，对象锚点不动。
fn retarget_drawing_refs(drawing: &SheetDrawing, key: u64, edit: ShiftEdit) -> SheetDrawing {
    let mut next = drawing.clone();
    for slot in &mut next.refs {
        if let Some(range) = *slot {
            if range.sheet == Some(key) {
                *slot = shift_range(range, edit);
            }
        }
    }
    next
}

/// 目录里是否有引用指向表 `key`。
pub(crate) fn references_sheet(drawings: &[SheetDrawing], key: u64) -> bool {
    drawings
        .iter()
        .any(|d| d.refs.iter().flatten().any(|r| r.sheet == Some(key)))
}

impl Sheet {
    pub(crate) fn retarget_drawings(&mut self, key: u64, edit: ShiftEdit) {
        for drawing in &mut self.drawings {
            *drawing = retarget_drawing_refs(drawing, key, edit);
        }
    }

    pub(crate) fn shift_drawings(&mut self, edit: ShiftEdit) {
        for drawing in &mut self.drawings {
            *drawing = shifted_drawing(drawing, edit);
        }
    }
}

impl crate::Workbook {
    /// 表 `sheet_index` 插删行列后，其他表里指向它的图表数据引用同步平移。
    pub(crate) fn retarget_drawing_references(&mut self, sheet_index: usize, edit: ShiftEdit) {
        let Some(key) = self.sheet_key(sheet_index) else {
            return;
        };
        for (index, sheet) in self.sheets.iter_mut().enumerate() {
            if index != sheet_index {
                sheet.retarget_drawings(key, edit);
            }
        }
    }

    /// 编辑会改动的对象目录所在表：被编辑表本身，加上有引用指向它的其他表。
    pub(crate) fn drawing_catalog_sheets(&self, sheet_index: usize) -> Vec<usize> {
        let key = self.sheet_key(sheet_index);
        (0..self.sheets.len())
            .filter(|&index| {
                index == sheet_index
                    || key.is_some_and(|key| references_sheet(self.sheets[index].drawings(), key))
            })
            .collect()
    }
}
