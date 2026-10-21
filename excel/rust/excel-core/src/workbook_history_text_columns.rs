//! 分列是一次原生历史事务；先完成预检，任何失败都不留下部分结果。
use super::*;
use crate::workbook_text_columns::{TextColumnsReport, TextColumnsRequest};
use crate::{CellAddress, CellStyle, StyleScope};

impl WorkbookHistory {
    /// 默认保持文字；显式类型只改数字格式，空字段清空目标，跳过字段不占输出列。
    pub fn split_text_columns(
        &mut self,
        workbook: &mut Workbook,
        request: &TextColumnsRequest,
        overwrite: bool,
    ) -> Result<TextColumnsReport, &'static str> {
        if self.pending.is_some() || workbook.is_inside_custom_call() {
            return Err("Another mutation is in progress.");
        }
        let plan = workbook.plan_text_columns(request);
        // 即使预检失败／等待覆盖确认，也不能留下本次读取的传播队列。
        workbook.store.settle_pending_reads();
        let plan = plan?;
        workbook.ensure_range_editable(request.sheet, plan.target)?;
        if plan.overwritten_cells > 0 && !overwrite {
            return Err("TEXT_COLUMNS_OVERWRITE_CONFIRMATION_REQUIRED");
        }
        self.begin(
            workbook,
            request.sheet,
            plan.target,
            "Text to columns",
            true,
        )?;
        // 保守预算包含前后快照及输出，宁可明确拒绝，也不能成功后丢掉本次撤销。
        let before = &self.pending.as_ref().unwrap().before[0].1;
        let output_bytes: usize = plan
            .fields
            .iter()
            .flatten()
            .map(|field| field.retained_bytes())
            .sum();
        if before
            .retained_bytes()
            .saturating_mul(2)
            .saturating_add(output_bytes)
            .saturating_add(workbook.name(request.sheet).unwrap().len() + 256)
            > MAX_BYTES
        {
            self.pending = None;
            return Err("Split exceeds the undo memory limit. Choose a smaller range.");
        }
        let store = workbook.store.clone();
        let mut outcome = Ok(());
        let mut changed_cells = 0;
        store.batch(|_| {
            outcome = plan
                .fields
                .into_iter()
                .enumerate()
                .try_for_each(|(row, fields)| {
                    fields.into_iter().enumerate().try_for_each(|(col, field)| {
                        let address = CellAddress::new(
                            plan.target.start.row + row as u32,
                            plan.target.start.col + col as u32,
                        );
                        let value = field.value;
                        let address_text = address.to_string();
                        let sheet = workbook.sheet(request.sheet).unwrap();
                        let format_changed = field.number_format.as_ref().is_some_and(|format| {
                            sheet.get_format(&address_text).number_format != *format
                        });
                        if !sheet.has_formula_at(address)
                            && sheet.peek_value(address) == value
                            && !format_changed
                        {
                            return Ok(());
                        }
                        workbook
                            .try_set_cell(request.sheet, &address_text, value)
                            .map_err(|_| "Could not write split output.")?;
                        if format_changed {
                            workbook
                                .sheet_mut(request.sheet)
                                .unwrap()
                                .patch_format_range(
                                    CellRange::single(address),
                                    StyleScope::Cell,
                                    CellStyle {
                                        number_format: field.number_format,
                                        ..Default::default()
                                    },
                                );
                        }
                        changed_cells += 1;
                        Ok(())
                    })
                });
            if let Err(error) = self.finish(workbook, outcome.is_ok()) {
                outcome = Err(error);
            }
        });
        outcome?;
        Ok(TextColumnsReport {
            target: plan.target,
            changed_cells,
        })
    }
}
