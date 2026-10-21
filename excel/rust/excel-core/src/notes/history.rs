//! 新增、修改、删除只生成一条原生历史；不改写原始单元格内容。
use super::*;
use crate::CellAddress;

impl WorkbookHistory {
    pub fn change_note(
        &mut self,
        workbook: &mut Workbook,
        sheet: usize,
        addr: CellAddress,
        text: Option<&str>,
    ) -> Result<bool, &'static str> {
        if self.pending.is_some() || workbook.is_inside_custom_call() {
            return Err("Another history command is pending.");
        }
        let range = CellRange::single(addr);
        validate_target(workbook, sheet, range)?;
        let text = text.map(crate::notes::normalize_note).transpose()?;
        let target = workbook.sheet(sheet).unwrap();
        if target
            .merged_range_at(addr)
            .is_some_and(|range| range.start != addr)
        {
            return Err("Select the anchor cell before changing its note.");
        }
        if target.note(addr) == text.as_deref() {
            return Ok(false);
        }
        let label = if text.is_none() {
            "Delete note"
        } else if target.note(addr).is_some() {
            "Edit note"
        } else {
            "Insert note"
        };
        // 元数据事务 content=false：撤销不会重新安装公式或改变表输入行。
        self.begin(workbook, sheet, range, label, false)?;
        let result = workbook
            .sheet_mut(sheet)
            .unwrap()
            .set_note(addr, text.as_deref());
        self.finish(workbook, result.is_ok())?;
        result
    }
}
