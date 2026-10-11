//! 用户单格编辑由 Rust 决定是普通输入还是 Table 表头改名，两个分支都只有一条历史。
use super::*;
use crate::CellAddress;

impl WorkbookHistory {
    pub fn set_cell_input(
        &mut self,
        workbook: &mut Workbook,
        sheet: usize,
        address: &str,
        input: &str,
    ) -> Result<(), String> {
        self.set_cell_input_with_table_expansion(workbook, sheet, address, input, true)
    }

    /// 宿主的工作表保护策略只关闭扩表，不改变普通输入的解析和历史。
    pub fn set_cell_input_with_table_expansion(
        &mut self,
        workbook: &mut Workbook,
        sheet: usize,
        address: &str,
        input: &str,
        expand_tables: bool,
    ) -> Result<(), String> {
        if self.pending.is_some() || workbook.is_inside_custom_call() {
            return Err("Another history command is pending.".into());
        }
        let addr = CellAddress::parse(address).ok_or("INVALID_ADDRESS")?;
        let range = CellRange::single(addr);
        validate_target(workbook, sheet, range)?;
        let sheet_name = workbook.name(sheet).ok_or("INVALID_SHEET")?;
        let header = workbook
            .list_tables()
            .into_iter()
            .find(|entry| {
                entry.has_headers()
                    && entry.sheet_name() == sheet_name
                    && entry.range().start.row == addr.row
                    && entry.range().contains(addr)
            })
            .map(|entry| {
                (
                    entry.name().to_string(),
                    entry.columns()[(addr.col - entry.range().start.col) as usize].clone(),
                )
            });
        if let Some((table, column)) = header {
            // 表头保存列名文字；数字/公式形状也不转成数据值，前导引号仍是输入标记。
            self.rename_table_column(
                workbook,
                &table,
                &column,
                input.strip_prefix('\'').unwrap_or(input),
            )?;
            return Ok(());
        }
        if expand_tables {
            if let Some(mut change) = crate::workbook::TableDefinitionChange::prepare_input_expansion(
                workbook, sheet, addr, input,
            )? {
                change.apply_expanding_input(workbook, addr, input)?;
                self.record_table_change(workbook, change, "Edit cell and expand table");
                return Ok(());
            }
        }
        self.begin(workbook, sheet, range, "Edit cell", true)?;
        let result = workbook.set_cell_input(sheet, address, input);
        self.finish(workbook, result.is_ok())?;
        result.map_err(str::to_string)
    }
}
