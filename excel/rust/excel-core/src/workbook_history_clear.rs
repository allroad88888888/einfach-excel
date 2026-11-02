//! 全部目标先预检，再在一个原生事务里清除；宿主不拆成多次写入。
use super::*;
use crate::{CellAddress, CellFormat, CellStyle, StyleScope};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ClearSelectionMode {
    Contents,
    Formats,
    All,
}

impl WorkbookHistory {
    pub fn clear_selection(
        &mut self,
        workbook: &mut Workbook,
        sheet: usize,
        targets: &[(CellRange, StyleScope)],
        mode: ClearSelectionMode,
    ) -> Result<CellRange, &'static str> {
        self.clear_selection_sheets(workbook, sheet, &[sheet], targets, mode)
    }

    pub fn clear_selection_sheets(
        &mut self,
        workbook: &mut Workbook,
        sheet: usize,
        sheets: &[usize],
        targets: &[(CellRange, StyleScope)],
        mode: ClearSelectionMode,
    ) -> Result<CellRange, &'static str> {
        if self.pending.is_some() || workbook.is_inside_custom_call() {
            return Err("Another mutation is in progress.");
        }
        if targets.is_empty() || targets.len() > 500 {
            return Err("Clear selection requires between 1 and 500 areas.");
        }
        let mut target_sheets = vec![sheet];
        for &extra in sheets {
            if !target_sheets.contains(&extra) {
                target_sheets.push(extra);
            }
        }
        let content = mode != ClearSelectionMode::Formats;
        let formats = mode != ClearSelectionMode::Contents;
        let mut visits = 0_u64;
        let mut affected = targets[0].0;
        let mut snapshots = Vec::new();
        for &target_sheet in &target_sheets {
            for &(range, scope) in targets {
                validate_target(workbook, target_sheet, range)?;
                workbook.ensure_range_editable(target_sheet, range)?;
                let source = workbook.sheet(target_sheet).unwrap();
                if source.merged_ranges().iter().any(|merged| {
                    merged.intersects(range)
                        && (!range.contains(merged.start) || !range.contains(merged.end))
                }) {
                    return Err("Select the entire merged cell before clearing.");
                }
                visits += u64::from(range.rows()) * u64::from(range.cols());
                // 内容清除是稀疏扫描，不设理论格数上限；格式清除会写 cellStyle，须先限量。
                if formats && visits > 100_000 {
                    return Err(
                        "Format clearing exceeds 100,000 addressed cells. Choose a smaller selection.",
                    );
                }
                affected.start.row = affected.start.row.min(range.start.row);
                affected.start.col = affected.start.col.min(range.start.col);
                affected.end.row = affected.end.row.max(range.end.row);
                affected.end.col = affected.end.col.max(range.end.col);
                snapshots.push((target_sheet, range, content));
                // 行列格式会改显示画布外已有的交叉样式，但不能把那些格子的值纳入恢复。
                if formats && scope != StyleScope::Cell {
                    let axis = match scope {
                        StyleScope::Row => CellRange::new(
                            CellAddress::new(range.start.row, 0),
                            CellAddress::new(range.end.row, 16_383),
                        ),
                        _ => CellRange::new(
                            CellAddress::new(0, range.start.col),
                            CellAddress::new(1_048_575, range.end.col),
                        ),
                    };
                    snapshots.push((target_sheet, axis, false));
                    workbook.ensure_range_editable(target_sheet, axis)?;
                }
            }
        }
        if content {
            for &target_sheet in &target_sheets {
                let source = workbook.sheet(target_sheet).unwrap();
                // 部分数组子格没有独立可清除的源；锚点可位于本次另一个区域中。
                for &anchor in source.spill_anchor_addr.values() {
                    let Some((rows, cols)) = source.spill_info(anchor) else {
                        continue;
                    };
                    if rows == 0 || cols == 0 {
                        continue;
                    }
                    let spill = CellRange::new(
                        anchor,
                        CellAddress::new(anchor.row + rows - 1, anchor.col + cols - 1),
                    );
                    if targets.iter().any(|(range, _)| range.intersects(spill))
                        && !targets.iter().any(|(range, _)| range.contains(anchor))
                    {
                        return Err("Cannot clear only a spill result. Include its formula cell.");
                    }
                }
            }
        }
        let label = match mode {
            ClearSelectionMode::Contents => "Clear contents",
            ClearSelectionMode::Formats => "Clear formats",
            ClearSelectionMode::All => "Clear all",
        };
        self.begin_ranges(workbook, sheet, affected, label, &snapshots, false)?;
        let store = workbook.store.clone();
        let mut outcome = Ok(());
        store.batch(|_| {
            outcome = target_sheets.iter().try_for_each(|&target_sheet| {
                targets.iter().try_for_each(|&(range, scope)| {
                    if formats {
                        self.patch_format_range(
                            workbook,
                            target_sheet,
                            range,
                            scope,
                            CellStyle::from_format(CellFormat::default()),
                        )?;
                    }
                    if content {
                        workbook.clear_range(target_sheet, range);
                    }
                    if mode == ClearSelectionMode::All {
                        workbook
                            .sheet_mut(target_sheet)
                            .unwrap()
                            .restore_hyperlinks(range, &[]);
                    }
                    Ok(())
                })
            });
            if let Err(error) = self.finish(workbook, outcome.is_ok()) {
                outcome = Err(error);
            }
        });
        outcome?;
        Ok(affected)
    }
}
