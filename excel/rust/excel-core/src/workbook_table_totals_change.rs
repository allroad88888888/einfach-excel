//! 汇总行改动只记录实际覆盖的单元格；汇总函数仍以单元格公式为唯一事实。
use super::*;
use crate::CellSnapshot;

impl TableDefinitionChange {
    pub(crate) fn prepare_totals_row(
        workbook: &Workbook,
        name: &str,
        enabled: bool,
    ) -> Result<Option<Self>, TableError> {
        let (sheet, before) = totals_target(workbook, name)?;
        if before.has_totals == enabled {
            return Ok(None);
        }
        let row = if enabled {
            before
                .range
                .end
                .row
                .checked_add(1)
                .filter(|row| *row <= GRID_MAX_ROW)
                .ok_or(TableError::TotalsRowBlocked)?
        } else {
            before.range.end.row
        };
        let range = CellRange::new(
            CellAddress::new(row, before.range.start.col),
            CellAddress::new(row, before.range.end.col),
        );
        validate_cells(workbook, sheet, range).map_err(|_| TableError::TotalsRowBlocked)?;
        let mut after = before.clone();
        after.has_totals = enabled;
        after.range.end.row = if enabled { row } else { row - 1 };
        let mut cells = Vec::new();
        if enabled {
            let mut occupied = false;
            workbook.sheets[sheet].for_each_non_empty_in_range(range, |_| occupied = true);
            if occupied
                || workbook.tables.values().any(|entry| {
                    entry.name() != before.name()
                        && entry.sheet_name() == before.sheet_name()
                        && entry.range().intersects(after.range())
                })
            {
                return Err(TableError::TotalsRowBlocked);
            }
            // 默认只为最后一列设置 SUM；不存第二份函数配置。
            let column = before.columns.last().ok_or(TableError::MalformedSnapshot)?;
            cells.push(CellSnapshot::formula(
                range.end,
                totals_subtotal_formula(before.name(), column, 109),
            ));
        }
        Self::totals_cells(workbook, sheet, before, after, range, cells)
    }

    pub(crate) fn prepare_total_function(
        workbook: &Workbook,
        name: &str,
        column: &str,
        function: TotalsFunction,
    ) -> Result<Option<Self>, TableError> {
        let (sheet, before) = totals_target(workbook, name)?;
        if !before.has_totals {
            return Err(TableError::NoTotalsRow);
        }
        let index = before
            .columns
            .iter()
            .position(|entry| entry.eq_ignore_ascii_case(column))
            .ok_or(TableError::ColumnNotFound)?;
        let address = CellAddress::new(before.range.end.row, before.range.start.col + index as u32);
        let range = CellRange::single(address);
        validate_cells(workbook, sheet, range).map_err(|_| TableError::TotalsRowBlocked)?;
        let cells = function
            .subtotal_code()
            .map(|code| {
                CellSnapshot::formula(
                    address,
                    totals_subtotal_formula(before.name(), &before.columns[index], code),
                )
            })
            .into_iter()
            .collect();
        Self::totals_cells(workbook, sheet, before.clone(), before, range, cells)
    }

    fn totals_cells(
        workbook: &Workbook,
        sheet: usize,
        before: TableEntry,
        after: TableEntry,
        range: CellRange,
        cells: Vec<CellSnapshot>,
    ) -> Result<Option<Self>, TableError> {
        let original = HistorySnapshot::capture(&workbook.sheets[sheet], range, true);
        let mut next = original.clone();
        next.cells = Some(cells);
        if before == after && original == next {
            return Ok(None);
        }
        Ok(Some(Self {
            sheet,
            range,
            before,
            after: Some(after),
            formulas: Vec::new(),
            rules: Vec::new(),
            lambdas: Vec::new(),
            cells: vec![(original, next)],
        }))
    }
}

fn totals_target(workbook: &Workbook, name: &str) -> Result<(usize, TableEntry), TableError> {
    if workbook.is_inside_custom_call() {
        return Err(TableError::MutationDuringCustomCall);
    }
    let table = workbook.get_table(name).ok_or(TableError::NotFound)?;
    let sheet = workbook
        .index_of(table.sheet_name())
        .ok_or(TableError::SheetNotFound)?;
    Ok((sheet, table.clone()))
}
