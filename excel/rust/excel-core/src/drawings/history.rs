//! 对象的新增、修改、移动、删除各生成一条原生历史；整份目录前后像，不碰单元格。
use super::*;
use crate::drawings::SheetDrawing;

#[derive(Debug)]
pub(super) struct DrawingChange {
    before: Vec<SheetDrawing>,
    after: Vec<SheetDrawing>,
}

impl DrawingChange {
    pub(super) fn apply(
        &self,
        workbook: &mut Workbook,
        sheet: usize,
        key: u64,
        undo: bool,
    ) -> Result<(), &'static str> {
        workbook.ensure_sheet_unprotected(sheet)?;
        if workbook.is_inside_custom_call() || workbook.sheet_key(sheet) != Some(key) {
            return Err("The worksheet changed outside history.");
        }
        let target = workbook.sheet_mut(sheet).unwrap();
        let expected = if undo { &self.after } else { &self.before };
        if target.drawings() != expected.as_slice() {
            return Err("Objects changed outside history.");
        }
        target.drawings.clone_from(if undo { &self.before } else { &self.after });
        Ok(())
    }

    pub(super) fn retained_bytes(&self) -> usize {
        crate::sheet::metadata_bytes(&self.before) + crate::sheet::metadata_bytes(&self.after)
    }
}

/// 撤销后选区回到对象锚点格，而不是跳到 A1。
fn anchor_cell(drawing: &SheetDrawing) -> CellRange {
    CellRange::single(crate::CellAddress::new(drawing.anchor.row, drawing.anchor.col))
}

fn change_label(before: Option<&SheetDrawing>, after: &SheetDrawing) -> &'static str {
    match before {
        None => "Insert object",
        Some(before)
            if before.kind == after.kind
                && before.refs == after.refs
                && before.payload == after.payload =>
        {
            if (before.anchor.width, before.anchor.height)
                == (after.anchor.width, after.anchor.height)
            {
                "Move object"
            } else {
                "Resize object"
            }
        }
        Some(_) => "Edit object",
    }
}

impl WorkbookHistory {
    /// 新 id 插入到最上层，已有 id 原位替换；无变化不进历史。
    pub fn set_drawing(
        &mut self,
        workbook: &mut Workbook,
        sheet: usize,
        drawing: SheetDrawing,
    ) -> Result<bool, &'static str> {
        self.ensure_drawing_target(workbook, sheet)?;
        let target = workbook.sheet_mut(sheet).unwrap();
        let before = target.drawings().to_vec();
        let label = change_label(target.drawing(&drawing.id), &drawing);
        let anchor = anchor_cell(&drawing);
        if !target.set_drawing(drawing)? {
            return Ok(false);
        }
        self.push_drawing_change(workbook, sheet, anchor, label, before);
        Ok(true)
    }

    pub fn remove_drawing(
        &mut self,
        workbook: &mut Workbook,
        sheet: usize,
        id: &str,
    ) -> Result<bool, &'static str> {
        self.ensure_drawing_target(workbook, sheet)?;
        let target = workbook.sheet_mut(sheet).unwrap();
        let before = target.drawings().to_vec();
        let Some(anchor) = target.drawing(id).map(anchor_cell) else {
            return Ok(false);
        };
        target.remove_drawing(id);
        self.push_drawing_change(workbook, sheet, anchor, "Delete object", before);
        Ok(true)
    }

    /// 置于顶层 / 置于底层：只改绘制顺序；已经在目标位置时不进历史。
    pub fn reorder_drawing(
        &mut self,
        workbook: &mut Workbook,
        sheet: usize,
        id: &str,
        to_front: bool,
    ) -> Result<bool, &'static str> {
        self.ensure_drawing_target(workbook, sheet)?;
        let target = workbook.sheet_mut(sheet).unwrap();
        let before = target.drawings().to_vec();
        let Some(anchor) = target.drawing(id).map(anchor_cell) else {
            return Ok(false);
        };
        if !target.reorder_drawing(id, to_front) {
            return Ok(false);
        }
        let label = if to_front { "Bring object to front" } else { "Send object to back" };
        self.push_drawing_change(workbook, sheet, anchor, label, before);
        Ok(true)
    }

    fn ensure_drawing_target(&self, workbook: &Workbook, sheet: usize) -> Result<(), &'static str> {
        if self.pending.is_some() || workbook.is_inside_custom_call() {
            return Err("Another history command is pending.");
        }
        if workbook.sheet(sheet).is_none() {
            return Err("History worksheet no longer exists.");
        }
        workbook.ensure_sheet_unprotected(sheet)
    }

    fn push_drawing_change(
        &mut self,
        workbook: &Workbook,
        sheet: usize,
        range: CellRange,
        label: &str,
        before: Vec<SheetDrawing>,
    ) {
        let key = workbook.sheet_key(sheet).unwrap();
        let after = workbook.sheet(sheet).unwrap().drawings().to_vec();
        self.push(HistoryEntry {
            label: label.to_owned(),
            sheet,
            range,
            sheet_key: key,
            sheet_name: workbook.name(sheet).unwrap().to_owned(),
            affected_keys: vec![key],
            affected_indices: vec![sheet],
            origin: Rc::downgrade(&workbook.atom_context),
            change: HistoryChange::Drawing(DrawingChange { before, after }),
        });
    }
}
