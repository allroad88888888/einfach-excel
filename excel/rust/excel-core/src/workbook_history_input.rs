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

    /// 保护策略关闭扩表/整列自动写入，不改变当前格普通输入的解析和历史。
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
        workbook.ensure_range_editable(sheet, range)?;
        let expand_tables = expand_tables && workbook.ensure_sheet_unprotected(sheet).is_ok();
        let sheet_name = workbook.name(sheet).ok_or("INVALID_SHEET")?;
        let table = workbook
            .list_tables()
            .into_iter()
            .find(|entry| entry.sheet_name() == sheet_name && entry.range().contains(addr));
        let in_table = table.is_some();
        let header = table
            .filter(|entry| entry.has_headers() && entry.range().start.row == addr.row)
            .map(|entry| {
                (
                    entry.name().to_string(),
                    entry.columns()[(addr.col - entry.range().start.col) as usize].clone(),
                )
            });
        if let Some((table, column)) = header {
            workbook.ensure_workbook_unprotected()?;
            // 表头保存列名文字；数字/公式形状也不转成数据值，前导引号仍是输入标记。
            let name = input.strip_prefix('\'').unwrap_or(input);
            if let Some(change) = crate::workbook::TableDefinitionChange::prepare_column_rename(
                workbook, &table, &column, name,
            )
            .map_err(|error| error.to_string())?
            {
                change.apply_validated_header(workbook, addr)?;
                self.record_table_change(workbook, change, "Rename table column");
            }
            return Ok(());
        }
        // 关闭扩表只禁止额外写入，不阻止当前待输入位置成为真实的一条记录。
        if let Some(mut change) = crate::workbook::TableDefinitionChange::prepare_insert_row_input(
            workbook,
            sheet,
            addr,
            input,
            expand_tables,
        )? {
            change.apply_expanding_input(workbook, addr, input, expand_tables)?;
            self.record_table_change(workbook, change, "Edit first table row");
            return Ok(());
        }
        if expand_tables {
            if let Some(mut change) =
                crate::workbook::TableDefinitionChange::prepare_calculated_input(
                    workbook, sheet, addr, input,
                )?
            {
                if change.apply_calculated_input(workbook)? {
                    self.record_table_change(workbook, change, "Edit calculated column");
                }
                return Ok(());
            }
            if let Some(mut change) =
                crate::workbook::TableDefinitionChange::prepare_input_expansion(
                    workbook, sheet, addr, input,
                )?
            {
                change.apply_expanding_input(workbook, addr, input, true)?;
                self.record_table_change(workbook, change, "Edit cell and expand table");
                return Ok(());
            }
        }
        self.begin(workbook, sheet, range, "Edit cell", true)?;
        if !in_table {
            let result = workbook.set_cell_input(sheet, address, input);
            self.finish(workbook, result.is_ok())?;
            return result.map_err(str::to_string);
        }
        let arrays = workbook.array_dependents_for_range(sheet, range);
        // Table 检查发生在求值后，提交/回滚之前不能让本表或跨表订阅看到临时数组。
        let observers: Vec<_> = workbook
            .sheets
            .iter_mut()
            .map(|sheet| sheet.suspend_structure_notifications())
            .collect();
        let store = workbook.store.clone();
        let mut outcome = Ok(());
        store.batch(|_| {
            let mut result = workbook.set_cell_input(sheet, address, input);
            // 有例外或受保护时走单格分支，但 Table 的数组限制仍然有效。
            if result.is_ok() {
                let target = workbook.sheet(sheet).expect("validated worksheet");
                if target.is_spill_region(addr) || target.blocked_anchor_shape(addr).is_some() {
                    result = Err("Spilled arrays cannot be entered inside a table.");
                }
            }
            outcome = self
                .finish(workbook, result.is_ok())
                .map_err(str::to_string)
                .and_then(|()| result.map_err(str::to_string));
        });
        // Store 批次传播结束后再更新溢出格；锚点新值本身不等于投影已刷新。
        workbook.recompute_array_formula_groups(arrays);
        for (sheet, observer) in workbook.sheets.iter_mut().zip(observers) {
            sheet.resume_structure_notifications(observer);
        }
        outcome
    }
}
