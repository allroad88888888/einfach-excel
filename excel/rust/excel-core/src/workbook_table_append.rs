//! 追加一条真实数据记录：复用待输入位置，或在汇总行前按 Table 列带腾位。
use super::*;
use crate::{workbook_history::MAX_BYTES, CellSnapshot};

impl TableDefinitionChange {
    pub(crate) fn prepare_append_row(
        workbook: &Workbook,
        name: &str,
        row_count: u32,
    ) -> Result<(Self, u32), String> {
        let before = workbook
            .get_table(name)
            .ok_or("The table no longer exists.")?
            .clone();
        let sheet = workbook
            .index_of(before.sheet_name())
            .ok_or("The worksheet no longer exists.")?;
        if row_count == 0 || row_count > GRID_MAX_ROW + 1 || before.range.end.row >= row_count {
            return Err("The table is outside this worksheet.".into());
        }
        if !before.insert_row {
            let row = before.range.end.row + 1 - u32::from(before.has_totals);
            return row_insert::prepare(
                workbook,
                sheet,
                before,
                row_count,
                row_insert::InsertRow::Data,
            )
            .map(|change| (change, row));
        }
        // 空表已有一个可输入位置，添加首条记录不能再制造第二个空行。
        let row = before.range.start.row + u32::from(before.has_headers);
        let range = CellRange::new(
            CellAddress::new(row, before.range.start.col),
            CellAddress::new(row, before.range.end.col),
        );
        validate_cells(workbook, sheet, range)?;
        let original =
            HistorySnapshot::capture_with_merges(&workbook.sheets[sheet], range, true, true);
        if !original.cells.as_ref().unwrap().is_empty() {
            return Err("The table input row is not empty.".into());
        }
        let mut next = original.clone();
        for (offset, formula) in before.calculated_columns.iter().enumerate() {
            if let Some(formula) = formula {
                next.cells.as_mut().unwrap().push(CellSnapshot::formula(
                    CellAddress::new(row, range.start.col + offset as u32),
                    formula.formula_at(row)?,
                ));
            }
        }
        let change = Self {
            sheet,
            range,
            after: Some(before.clone().with_insert_row(false)),
            before,
            cells: vec![(original, next)],
            formulas: Vec::new(),
            rules: Vec::new(),
            lambdas: Vec::new(),
            named_ranges: Vec::new(),
            shifted_tables: Vec::new(),
            filter: None,
            validations: ValidationShift::default(),
        };
        if change.retained_bytes() > MAX_BYTES {
            return Err("Adding a table row exceeds the 32 MiB undo budget.".into());
        }
        Ok((change, row))
    }

    pub(crate) fn apply_appending_row(
        &self,
        workbook: &mut Workbook,
        row: u32,
    ) -> Result<(), String> {
        let table = self.after.as_ref().unwrap();
        let range = CellRange::new(
            CellAddress::new(row, table.range.start.col),
            CellAddress::new(row, table.range.end.col),
        );
        let mut arrays = workbook.array_dependents_for_range(self.sheet, range);
        arrays.extend(
            workbook.array_dependents_for_atoms(&workbook.atom_context.table_dependent_atoms()),
        );
        let observers: Vec<_> = workbook
            .sheets
            .iter_mut()
            .map(Sheet::suspend_structure_notifications)
            .collect();
        let store = workbook.store.clone();
        let mut result = Ok(());
        store.batch(|_| {
            result = self.apply(workbook, false);
            if result.is_err() {
                return;
            }
            workbook.settle_validation_candidate(self.sheet, range);
            result = validate_cells(workbook, self.sheet, range).and_then(|_| {
                table
                    .calculated_columns
                    .iter()
                    .enumerate()
                    .try_for_each(|(offset, formula)| {
                        let Some(formula) = formula else {
                            return Ok(());
                        };
                        let addr = CellAddress::new(row, range.start.col + offset as u32);
                        let expr =
                            parse_formula(&formula.formula_at(row)?).ok_or("INVALID_FORMULA")?;
                        if workbook.closes_workbook_cycle(self.sheet, addr, &expr) {
                            return Err("FORMULA_CYCLE");
                        }
                        let value = crate::sheet::collapse_array_for_eval(
                            workbook.sheets[self.sheet].peek_value(addr),
                        );
                        workbook.validate_input_value(self.sheet, addr, &value)
                    })
            });
            if result.is_err() {
                self.apply(workbook, true)
                    .expect("append rollback retains its table and row snapshots");
                workbook.settle_validation_candidate(self.sheet, range);
            }
        });
        workbook.recompute_array_formula_groups(arrays);
        for (sheet, observer) in workbook.sheets.iter_mut().zip(observers) {
            sheet.resume_structure_notifications(observer);
        }
        result.map_err(str::to_string)
    }
}
