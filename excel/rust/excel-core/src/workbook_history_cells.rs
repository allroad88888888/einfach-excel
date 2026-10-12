//! 格子事务记录同次写入激活的空表输入行；值与定义共用一次撤销。
use super::*;

impl WorkbookHistory {
    pub fn begin(
        &mut self,
        workbook: &Workbook,
        sheet: usize,
        range: CellRange,
        label: &str,
        content: bool,
    ) -> Result<(), &'static str> {
        self.begin_ranges(
            workbook,
            sheet,
            range,
            label,
            &[(sheet, range, content)],
            false,
        )
    }

    /// 多范围仍是一条用户操作，范围由原生命令的预检结果提供。
    pub(crate) fn begin_ranges(
        &mut self,
        workbook: &Workbook,
        sheet: usize,
        range: CellRange,
        label: &str,
        targets: &[(usize, CellRange, bool)],
        merges: bool,
    ) -> Result<(), &'static str> {
        if self.pending.is_some() {
            return Err("Another history command is pending.");
        }
        validate_target(workbook, sheet, range)?;
        for (sheet, range, _) in targets {
            validate_target(workbook, *sheet, *range)?;
        }
        self.pending = Some(PendingEdit {
            label: label.to_owned(),
            sheet,
            range,
            table_rows: workbook.insert_rows_for_ranges(targets),
            before: targets
                .iter()
                .map(|(index, range, content)| {
                    (
                        *index,
                        HistorySnapshot::capture_with_merges(
                            workbook.sheet(*index).unwrap(),
                            *range,
                            *content,
                            merges && *index == sheet,
                        ),
                    )
                })
                .collect(),
        });
        Ok(())
    }

    pub fn finish(&mut self, workbook: &mut Workbook, success: bool) -> Result<(), &'static str> {
        let mut pending = self
            .pending
            .take()
            .ok_or("No history command is pending.")?;
        // 邻边等额外快照可能在后续子操作前追加；撤销必须倒放这些 before-image，
        // 最后恢复事务起点，不能让较晚的中间态覆盖最早的原值。
        pending.before.reverse();
        let after = pending
            .before
            .iter()
            .map(|(sheet, before)| {
                let target = workbook
                    .sheet(*sheet)
                    .ok_or("History worksheet no longer exists.")?;
                Ok((
                    *sheet,
                    HistorySnapshot::capture_with_merges(
                        target,
                        before.range,
                        before.cells.is_some(),
                        before.merges.is_some(),
                    ),
                ))
            })
            .collect::<Result<Vec<_>, &'static str>>()?;
        // 只记录本次由待输入位置变成记录的表，不快照整个注册表。
        let table_rows: Vec<_> = pending
            .table_rows
            .into_iter()
            .filter(|before| {
                workbook.get_table(before.name()) == Some(&before.clone().with_insert_row(false))
            })
            .collect();
        if pending.before == after && table_rows.is_empty() {
            return Ok(());
        }
        if !success {
            return workbook.restore_cell_history(&pending.before, &table_rows, true);
        }
        if let Err(error) = workbook.validate_insert_row_arrays(&table_rows) {
            workbook.restore_cell_history(&pending.before, &table_rows, true)?;
            return Err(error);
        }
        let affected_indices: Vec<_> = pending
            .before
            .iter()
            .map(|(sheet, _)| *sheet)
            .collect::<std::collections::BTreeSet<_>>()
            .into_iter()
            .collect();
        self.push(HistoryEntry {
            label: pending.label,
            sheet: pending.sheet,
            range: pending.range,
            sheet_key: workbook.sheet_key(pending.sheet).unwrap(),
            sheet_name: workbook.name(pending.sheet).unwrap().to_owned(),
            affected_keys: affected_indices
                .iter()
                .map(|index| workbook.sheet_key(*index).unwrap())
                .collect(),
            affected_indices,
            origin: Rc::downgrade(&workbook.atom_context),
            change: HistoryChange::Cells {
                before: pending.before,
                after,
                table_rows,
            },
        });
        Ok(())
    }
}
