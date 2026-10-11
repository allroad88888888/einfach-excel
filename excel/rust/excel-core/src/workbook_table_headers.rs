//! 表头显隐只改变一行内容及 Table 起点；数据行保持原坐标。
use super::*;
use crate::{CellSnapshot, workbook_history::MAX_BYTES};

impl TableDefinitionChange {
    pub(crate) fn prepare_headers(
        workbook: &Workbook, name: &str, enabled: bool,
    ) -> Result<Option<Self>, String> {
        if workbook.is_inside_custom_call() {
            return Err("Cannot change table headers during a custom call.".into());
        }
        let before = workbook.get_table(name).ok_or("The table no longer exists.")?.clone();
        if before.has_headers == enabled { return Ok(None); }
        let sheet = workbook.index_of(before.sheet_name()).ok_or("The worksheet no longer exists.")?;
        let row = if enabled {
            before.range.start.row.checked_sub(1).ok_or("There is no room above the table for headers.")?
        } else {
            if before.range.rows() <= 1 + u32::from(before.has_totals) {
                return Err("The table needs a data row before its headers can be hidden.".into());
            }
            before.range.start.row
        };
        let range = CellRange::new(CellAddress::new(row, before.range.start.col),
            CellAddress::new(row, before.range.end.col));
        validate_cells(workbook, sheet, range)?;
        let original = HistorySnapshot::capture(&workbook.sheets[sheet], range, true);
        if enabled && (!original.cells.as_ref().unwrap().is_empty()
            || workbook.tables.values().any(|entry| entry.name() != before.name()
                && entry.sheet_name() == before.sheet_name() && entry.range().intersects(range))) {
            return Err("The row above the table is occupied. Make room before showing headers.".into());
        }
        let mut after = before.clone();
        after.has_headers = enabled;
        after.range.start.row = if enabled { row } else { row + 1 };
        let mut next = original.clone();
        next.cells = Some(if enabled {
            after.columns.iter().enumerate().map(|(offset, name)| CellSnapshot::value(
                CellAddress::new(row, range.start.col + offset as u32), Value::Text(name.clone()),
            )).collect()
        } else { Vec::new() });
        // 当前引擎只有一个显式区域筛选；只清理同表头、同列跨度且不超出表的筛选。
        // 其它区域的筛选、手动隐藏行和大纲都不属于这个开关。
        let filter = if !enabled {
            workbook.sheets[sheet].filter().filter(|filter| filter.range().is_some_and(|bounds|
                bounds.start == before.range.start && bounds.end.col == before.range.end.col
                    && bounds.end.row <= before.range.end.row))
                .map(|filter| (Some(filter.clone()), None))
        } else { None };
        let change = Self { sheet, range, before, after: Some(after),
            formulas: Vec::new(), rules: Vec::new(), lambdas: Vec::new(),
            cells: vec![(original, next)], filter };
        if change.retained_bytes() > MAX_BYTES {
            return Err("Changing table headers exceeds the 32 MiB undo budget.".into());
        }
        Ok(Some(change))
    }
}
