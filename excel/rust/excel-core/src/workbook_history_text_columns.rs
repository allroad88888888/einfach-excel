//! 分列是一次原生历史事务；先完成预检，任何失败都不留下部分结果。
use super::*;
use crate::workbook_text_columns::{TextColumnsReport, TextColumnsRequest};
use crate::CellAddress;
use einfach_core::Value;

impl WorkbookHistory {
    /// 输出字段保持文字；空字段清空目标，不改目标格式或行列尺寸。
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
            .filter(|text| !text.is_empty())
            .map(|text| text.len() + 96)
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
                    fields.into_iter().enumerate().try_for_each(|(col, text)| {
                        let address = CellAddress::new(
                            plan.target.start.row + row as u32,
                            plan.target.start.col + col as u32,
                        );
                        let value = if text.is_empty() {
                            Value::Null
                        } else {
                            Value::Text(text)
                        };
                        let sheet = workbook.sheet(request.sheet).unwrap();
                        if !sheet.has_formula_at(address) && sheet.peek_value(address) == value {
                            return Ok(());
                        }
                        workbook
                            .try_set_cell(request.sheet, &address.to_string(), value)
                            .map_err(|_| "Could not write split output.")?;
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
