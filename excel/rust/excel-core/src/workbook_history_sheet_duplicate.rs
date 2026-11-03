//! 复制工作表是一次“新增工作表”历史：撤销归档副本，重做原样恢复。
use super::*;

impl WorkbookHistory {
    /// 在源表之后创建名为 `Name (2)` 的副本；返回副本索引。
    pub fn duplicate_sheet(
        &mut self,
        workbook: &mut Workbook,
        source: usize,
    ) -> Result<usize, &'static str> {
        self.require_idle()?;
        let name = workbook.unique_copy_name(source)?;
        let index = workbook.copy_sheet_after(source, &name)?;
        let change = SheetHistoryChange::created(workbook, index);
        self.push_sheet(
            workbook,
            index,
            workbook.sheet_key(index).unwrap(),
            name,
            "Duplicate worksheet",
            change,
        );
        Ok(index)
    }
}
