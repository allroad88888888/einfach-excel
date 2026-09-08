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
        mut history: Option<&mut crate::workbook_history::WorkbookHistory>,
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
        let planned = paste_values::plan_cells(self, snapshot, sheet_idx, range, options, &merges)?;
        let dependents = if snapshot.cut {
            move_refs::dependent_writes(self, sheet_idx, snapshot.source, range)?
        } else {
            Vec::new()
        };

        if let Some(history) = history.as_deref_mut() {
            history.begin_ranges(
                self,
                sheet_idx,
                history_targets::affected_range(snapshot, range, sheet_idx, &dependents),
                if snapshot.cut {
                    "Move cells"
                } else {
                    options.arithmetic.history_label()
                },
                &history_targets::targets(
                    snapshot,
                    range,
                    sheet_idx,
                    options,
                    planned.iter().map(|(addr, _, _)| *addr),
                    &dependents,
                ),
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
        );
        if let Some(history) = history {
            history.finish(self, true)?;
        }
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
