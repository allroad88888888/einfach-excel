//! 粘贴事务：完整预检后再一次写入，重叠剪切先清源再落目标。

use super::*;

impl Workbook {
    pub fn paste_clipboard(
        &mut self,
        snapshot: &ClipboardSnapshot,
        sheet_idx: usize,
        options: &ClipboardPasteOptions,
    ) -> Result<CellRange, ClipboardError> {
        self.paste_clipboard_recorded(snapshot, sheet_idx, options, None)
    }

    /// 已有粘贴事务直接接入原生历史，预检和写入只执行一次。
    pub fn paste_clipboard_with_history(
        &mut self,
        snapshot: &ClipboardSnapshot,
        sheet_idx: usize,
        options: &ClipboardPasteOptions,
        history: &mut crate::workbook_history::WorkbookHistory,
    ) -> Result<CellRange, ClipboardError> {
        self.paste_clipboard_recorded(snapshot, sheet_idx, options, Some(history))
    }

    fn paste_clipboard_recorded(
        &mut self,
        snapshot: &ClipboardSnapshot,
        sheet_idx: usize,
        options: &ClipboardPasteOptions,
        history: Option<&mut crate::workbook_history::WorkbookHistory>,
    ) -> Result<CellRange, ClipboardError> {
        if self.is_inside_custom_call() {
            return Err("CLIPBOARD_MUTATION_DURING_CUSTOM_CALL");
        }
        let sheet = self.sheet(sheet_idx).ok_or("CLIPBOARD_INVALID_SHEET")?;
        let logical_target = merge::logical_target(snapshot, sheet, options);
        let range = snapshot.paste_target(options, logical_target)?;
        if options.mode == ClipboardPasteMode::ColumnWidths {
            return self.paste_column_widths(snapshot, sheet_idx, range, history);
        }
        if snapshot.cut {
            // 剪切后新应用的筛选也不能让粘贴暗中删除不可见源行。
            if sheet.filter_hidden_set().is_some_and(|rows| {
                rows.range(snapshot.source.start.row..=snapshot.source.end.row)
                    .next()
                    .is_some()
            }) {
                return Err("CLIPBOARD_FILTERED_CUT");
            }
            if snapshot.source_sheet != Some(sheet_idx) {
                return Err("CLIPBOARD_CROSS_SHEET_CUT");
            }
            if sheet.merges_in_range(snapshot.source) != snapshot.merges {
                return Err("CLIPBOARD_CUT_SOURCE_CHANGED");
            }
            for (addr, original) in snapshot.source.iter().zip(&snapshot.cells) {
                let current = read_cell(sheet, addr);
                if sheet.is_spill_region(addr)
                    || current.format != original.format
                    || !same_input(&current.value, &original.value)
                {
                    return Err("CLIPBOARD_CUT_SOURCE_CHANGED");
                }
            }
        }
        let merges = merge::MergePastePlan::prepare(
            self,
            snapshot,
            sheet_idx,
            options,
            range,
            logical_target.is_some(),
        )?;
        let mut planned = paste_values::plan_cells(self, snapshot, sheet_idx, range, options, &merges)?;
        let explicit_count = planned.len();
        let expansion = if !snapshot.cut && options.unlocked_ranges.is_none()
            && options.mode != ClipboardPasteMode::Formats && !merges.changed() {
            crate::workbook::TableDefinitionChange::prepare_paste_expansion(
                self, sheet_idx, range, &mut planned)?
        } else { None };
        let mut validation_formulas =
            paste_values::validate_inputs(self, sheet_idx, options.mode, &planned)?;
        // 模板是引擎补写的输入，沿用手动扩表校验；显式公式粘贴仍保留原模式语义。
        validation_formulas.extend(planned[explicit_count..].iter().filter_map(|(addr, value, _)| {
            (matches!(value, Some(ClipboardValue::Formula { .. }))
                && self.sheets[sheet_idx].data_validation_at(*addr).is_some()).then_some(*addr)
        }));
        validation_formulas.sort_unstable_by_key(|addr| (addr.row, addr.col));
        validation_formulas.dedup();
        // 无历史的原生调用也必须可原子拒绝；临时历史只用于失败恢复，不暴露给宿主。
        let mut rollback = crate::workbook_history::WorkbookHistory::default();
        let enters_table = options.mode != ClipboardPasteMode::Formats
            && !self
                .insert_rows_for_writes(planned.iter().map(|(addr, _, _)| (sheet_idx, *addr)))
                .is_empty();
        let mut history = history
            .or_else(|| (enters_table || !validation_formulas.is_empty()).then_some(&mut rollback));
        let sheet = self.sheet(sheet_idx).unwrap();
        let cleared = snapshot
            .source
            .iter()
            .take(if snapshot.cut {
                snapshot.source.cell_count() as usize
            } else {
                0
            })
            .map(|addr| (addr, crate::CellBorders::default()));
        let replaced = planned
            .iter()
            .filter_map(|(addr, _, format)| Some((*addr, format.as_ref()?.borders.clone()?)));
        let borders = sheet
            .plan_replacement_borders(cleared.chain(replaced), &merges.resulting_ranges(sheet));
        let dependents = if snapshot.cut {
            move_refs::dependent_writes(self, sheet_idx, snapshot.source, range)?
        } else {
            Vec::new()
        };

        if let Some(change) = expansion {
            let mut affected = range;
            for addr in planned.iter().map(|(addr, _, _)| *addr).chain(
                crate::sheet::border_plan_range(&borders).into_iter().flat_map(|range| [range.start, range.end]),
            ) {
                affected.start.row = affected.start.row.min(addr.row);
                affected.start.col = affected.start.col.min(addr.col);
                affected.end.row = affected.end.row.max(addr.row);
                affected.end.col = affected.end.col.max(addr.col);
            }
            // 无宿主历史时仍复用同一个原子事务，局部历史随调用结束释放。
            let mut temporary = crate::workbook_history::WorkbookHistory::default();
            history.as_deref_mut().unwrap_or(&mut temporary).paste_expanding_table(
                self, change, affected, |workbook| apply::apply_paste(
                    workbook, snapshot, sheet_idx, options, planned, &dependents, &merges,
                    borders, &validation_formulas, None,
                ),
            )?;
            return Ok(range);
        }

        if let Some(history) = history.as_deref_mut() {
            let mut targets = history_targets::targets(
                snapshot,
                range,
                sheet_idx,
                options,
                planned.iter().map(|(addr, _, _)| *addr),
                &dependents,
            );
            if let Some(affected) = crate::sheet::border_plan_range(&borders) {
                targets.push((sheet_idx, affected, false));
            }
            history.begin_ranges(
                self,
                sheet_idx,
                history_targets::affected_range(snapshot, range, sheet_idx, &dependents),
                if snapshot.cut {
                    "Move cells"
                } else {
                    options.arithmetic.history_label()
                },
                &targets,
                merges.changed(),
            )?;
        }

        apply::apply_paste(
            self,
            snapshot,
            sheet_idx,
            options,
            planned,
            &dependents,
            &merges,
            borders,
            &validation_formulas,
            history,
        )?;
        Ok(range)
    }
}

/// 剪切预检比较输入，不把依赖变化导致的公式结果更新误判为源格被改。
fn same_input(current: &ClipboardValue, original: &ClipboardValue) -> bool {
    match (current, original) {
        (ClipboardValue::Formula { source: a, .. }, ClipboardValue::Formula { source: b, .. }) => {
            a == b
        }
        _ => current == original,
    }
}
