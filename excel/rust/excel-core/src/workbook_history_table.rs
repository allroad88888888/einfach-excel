//! Table 命令接入唯一原生历史栈；失败不消耗 redo。
use super::*;
use crate::workbook::{TableCreation, TableDefinitionChange};

impl WorkbookHistory {
    /// 表头文字、目录列名与结构化引用必须共同提交为一条历史。
    pub fn rename_table_column(
        &mut self,
        workbook: &mut Workbook,
        name: &str,
        old_column: &str,
        new_column: &str,
    ) -> Result<bool, String> {
        if self.pending.is_some() || workbook.is_inside_custom_call() {
            return Err("Another history command is pending.".into());
        }
        let Some(change) = TableDefinitionChange::prepare_column_rename(workbook, name, old_column, new_column)
            .map_err(|error| error.to_string())?
        else { return Ok(false); };
        self.finish_table_change(workbook, change, "Rename table column")?;
        Ok(true)
    }

    /// 汇总行的范围与公式是同一条历史；空操作或拒绝不截断 redo。
    pub fn set_table_totals_row(
        &mut self,
        workbook: &mut Workbook,
        name: &str,
        enabled: bool,
    ) -> Result<bool, String> {
        if self.pending.is_some() || workbook.is_inside_custom_call() {
            return Err("Another history command is pending.".into());
        }
        let Some(change) = TableDefinitionChange::prepare_totals_row(workbook, name, enabled)
            .map_err(|error| error.to_string())?
        else {
            return Ok(false);
        };
        self.finish_table_change(
            workbook,
            change,
            if enabled {
                "Show table totals"
            } else {
                "Hide table totals"
            },
        )?;
        Ok(true)
    }

    pub fn set_table_total_function(
        &mut self,
        workbook: &mut Workbook,
        name: &str,
        column: &str,
        function: crate::TotalsFunction,
    ) -> Result<bool, String> {
        if self.pending.is_some() || workbook.is_inside_custom_call() {
            return Err("Another history command is pending.".into());
        }
        let Some(change) =
            TableDefinitionChange::prepare_total_function(workbook, name, column, function)
                .map_err(|error| error.to_string())?
        else {
            return Ok(false);
        };
        self.finish_table_change(workbook, change, "Set table total function")?;
        Ok(true)
    }

    /// 改名影响的所有公式与表定义共用一条历史，拒绝/无操作不截断 redo。
    pub fn rename_table(
        &mut self,
        workbook: &mut Workbook,
        name: &str,
        new_name: &str,
    ) -> Result<bool, String> {
        if self.pending.is_some() || workbook.is_inside_custom_call() {
            return Err("Another history command is pending.".into());
        }
        let Some(change) = TableDefinitionChange::prepare_rename(workbook, name, new_name)
            .map_err(|error| error.to_string())?
        else {
            return Ok(false);
        };
        self.finish_table_change(workbook, change, "Rename table")?;
        Ok(true)
    }

    /// 转成普通区域只移除 Table 语义并改写引用；数据与格式不复制、不重建。
    pub fn convert_table_to_range(
        &mut self,
        workbook: &mut Workbook,
        name: &str,
    ) -> Result<(), String> {
        if self.pending.is_some() || workbook.is_inside_custom_call() {
            return Err("Another history command is pending.".into());
        }
        let change = TableDefinitionChange::prepare_convert(workbook, name)?;
        self.finish_table_change(workbook, change, "Convert table to range")
    }

    fn finish_table_change(
        &mut self,
        workbook: &mut Workbook,
        change: TableDefinitionChange,
        label: &str,
    ) -> Result<(), String> {
        let sheet = change.sheet;
        let sheet_key = workbook.sheet_key(sheet).unwrap();
        let affected_indices = change.affected_sheets(workbook);
        change.apply(workbook, false)?;
        self.push(HistoryEntry {
            label: label.into(),
            sheet,
            range: change.range,
            sheet_key,
            sheet_name: workbook.name(sheet).unwrap().into(),
            affected_keys: affected_indices
                .iter()
                .map(|index| workbook.sheet_key(*index).unwrap())
                .collect(),
            affected_indices,
            origin: Rc::downgrade(&workbook.atom_context),
            change: HistoryChange::TableDefinition(Box::new(change)),
        });
        Ok(())
    }

    /// 第一行作为表头，规范化文字与注册定义作为一次可撤销操作提交。
    pub fn create_table(
        &mut self,
        workbook: &mut Workbook,
        sheet: usize,
        range: CellRange,
        name: Option<&str>,
    ) -> Result<String, String> {
        if self.pending.is_some() || workbook.is_inside_custom_call() {
            return Err("Another history command is pending.".into());
        }
        let sheet_key = workbook
            .sheet_key(sheet)
            .ok_or("The worksheet no longer exists.")?;
        let change = TableCreation::prepare(workbook, sheet, range, name)?;
        let name = change.name().to_string();
        change.apply(workbook, false)?;
        self.push(HistoryEntry {
            label: "Create table".into(),
            sheet,
            range: range.normalize(),
            sheet_key,
            sheet_name: workbook.name(sheet).unwrap().into(),
            affected_keys: vec![sheet_key],
            affected_indices: vec![sheet],
            origin: Rc::downgrade(&workbook.atom_context),
            change: HistoryChange::TableCreate(Box::new(change)),
        });
        Ok(name)
    }
}
