//! 宿主批量 patch 保留旧历史；失败在同一个 Store 批次中恢复全部前像。
use super::*;
use crate::workbook_history::WorkbookHistory;
use std::collections::BTreeSet;

impl WorkbookHistory {
    pub fn write_host_cells(&mut self, workbook: &mut Workbook, cells: &[HostCellWrite])
        -> Result<bool, &'static str>
    {
        if self.is_pending() || workbook.is_inside_custom_call() {
            return Err("Another history command is pending.");
        }
        if cells.len() > MAX_CELLS { return Err("HOST_WRITE_BUDGET_EXCEEDED"); }
        if cells.is_empty() { return Ok(false); }
        let mut seen = BTreeSet::new();
        let mut bytes = 0;
        let mut targets = Vec::new();
        for cell in cells {
            let addr = address(cell);
            let range = CellRange::single(addr);
            validate_range(workbook, cell.sheet, range)?;
            workbook.ensure_range_editable(cell.sheet, range)?;
            if !seen.insert((cell.sheet, cell.row, cell.col)) { return Err("DUPLICATE_HOST_CELL"); }
            let target = workbook.sheet(cell.sheet).unwrap();
            // Table 定义/数组覆盖需要专用原生事务；首版明确拒绝，不悄悄扩大写入集合。
            if target.merged_range_at(addr).is_some_and(|range| range.start != addr)
                || target.spill_intersecting(range).is_some()
                || target.blocked_anchor_shape(addr).is_some()
                || workbook.list_tables().iter().any(|table|
                    Some(table.sheet_name()) == workbook.name(cell.sheet)
                        && table.range().contains(addr))
            { return Err("HOST_COMPLEX_TARGET_UNSUPPORTED"); }
            match &cell.input {
                HostCellInput::Literal { value } => {
                    value.clone().into_value()?;
                    if let RawCellValue::String { value } = value { bytes += value.len(); }
                }
                HostCellInput::Formula { formula } => {
                    bytes += formula.len();
                    if !formula.starts_with('=') || crate::formula::parse_formula(formula).is_none() {
                        return Err("INVALID_FORMULA");
                    }
                }
            }
            bytes += 256;
            targets.push((cell.sheet, range, true));
        }
        if bytes > MAX_BYTES { return Err("HOST_WRITE_BUDGET_EXCEEDED"); }
        // 预算也覆盖旧值，防止删除长文本导致撤销预算把先前历史一起挤掉。
        let retained: usize = targets.iter().map(|(sheet, range, _)|
            crate::history_snapshot::HistorySnapshot::capture(workbook.sheet(*sheet).unwrap(), *range, true)
                .retained_bytes()).sum();
        if retained + bytes > MAX_BYTES { return Err("HOST_WRITE_BUDGET_EXCEEDED"); }
        self.begin_ranges(workbook, cells[0].sheet, targets[0].1, "Host write", &targets, false)?;
        let observers: Vec<_> = workbook.sheets.iter_mut()
            .map(crate::Sheet::suspend_structure_notifications).collect();
        let store = workbook.store.clone();
        let before = self.mutation_sequence();
        let mut outcome = Ok(());
        store.batch(|_| {
            outcome = cells.iter().try_for_each(|cell| {
                let addr = address(cell).to_string();
                match &cell.input {
                    HostCellInput::Literal { value } => workbook.try_set_cell(cell.sheet, &addr,
                        value.clone().into_value()?).map_err(|_| "HOST_WRITE_REJECTED"),
                    HostCellInput::Formula { formula } =>
                        match workbook.try_set_formula(cell.sheet, &addr, formula) {
                            Ok(true) => Ok(()), _ => Err("INVALID_FORMULA_OR_CYCLE"),
                        },
                }
            });
            if outcome.is_ok() {
                outcome = cells.iter().try_for_each(|cell| {
                    let range = CellRange::single(address(cell));
                    workbook.settle_validation_candidate(cell.sheet, range);
                    let value = workbook.get_cell(workbook.name(cell.sheet).unwrap(), &address(cell).to_string());
                    workbook.validate_input_value(cell.sheet, address(cell), &value)
                });
            }
            let finish = self.finish(workbook, outcome.is_ok());
            if outcome.is_ok() { outcome = finish; }
            if outcome.is_err() {
                // 回滚源值之后重投候选曾改变的数组形状，不能留下已拒绝的 spill 子格。
                for (sheet, range, _) in &targets {
                    workbook.settle_validation_candidate(*sheet, *range);
                }
            }
        });
        for (sheet, observer) in workbook.sheets.iter_mut().zip(observers) {
            sheet.resume_structure_notifications(observer);
        }
        outcome?;
        Ok(before != self.mutation_sequence())
    }
}
