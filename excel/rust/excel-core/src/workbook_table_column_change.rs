//! 列名变更只记录一个表头与实际变化的消费者；复用 Table 原子历史，不复制数据区。
use super::*;
use crate::CellSnapshot;

impl TableDefinitionChange {
    pub(crate) fn prepare_column_rename(
        workbook: &Workbook,
        name: &str,
        old_column: &str,
        new_column: &str,
    ) -> Result<Option<Self>, TableError> {
        if workbook.is_inside_custom_call() {
            return Err(TableError::MutationDuringCustomCall);
        }
        // 与创建 Table 的列名派生一致，去掉首尾空白后再判重。
        let new_column = new_column.trim();
        if new_column.is_empty() {
            return Err(TableError::InvalidColumnName);
        }
        let before = workbook
            .get_table(name)
            .ok_or(TableError::NotFound)?
            .clone();
        let index = before
            .columns
            .iter()
            .position(|column| column.eq_ignore_ascii_case(old_column))
            .ok_or(TableError::ColumnNotFound)?;
        if before
            .columns
            .iter()
            .enumerate()
            .any(|(other, column)| other != index && column.eq_ignore_ascii_case(new_column))
        {
            return Err(TableError::DuplicateColumn);
        }
        let sheet = workbook
            .index_of(before.sheet_name())
            .ok_or(TableError::SheetNotFound)?;
        let header = CellAddress::new(
            before.range.start.row,
            before.range.start.col + index as u32,
        );
        let range = CellRange::single(header);
        let cells = if before.has_headers {
            validate_cells(workbook, sheet, range)
                .map_err(|_| TableError::FormulaRewriteConflict)?;
            let original = HistorySnapshot::capture(&workbook.sheets[sheet], range, true);
            let mut next = original.clone();
            next.cells = Some(vec![CellSnapshot::value(
                header,
                Value::Text(new_column.into()),
            )]);
            Some((original, next))
        } else {
            None
        };
        let column_changed = before.columns[index] != new_column;
        if !column_changed
            && cells
                .as_ref()
                .is_none_or(|(original, next)| original == next)
        {
            return Ok(None);
        }
        let mut after = before.clone();
        after.columns[index] = new_column.into();
        let resolved = before.to_resolved(sheet);
        let renamer = crate::shift::TableColumnEdit {
            table: &resolved,
            spec: crate::shift::TableRefEditSpec::RenameColumn {
                table_upper: before.name().to_ascii_uppercase(),
                from: before.columns[index].clone(),
                to: new_column.into(),
            },
        };
        let mut formulas =
            FormulaSourceChange::prepare(workbook, &|source_sheet, source_range, template, expr| {
                // 表头本身由局部快照替换为列名文本，不能再用旧公式覆盖一次。
                column_changed
                    && !(template.is_none() && before.has_headers
                        && source_sheet == sheet && source_range == range)
                    && renamer.rewrite(expr, Some((source_sheet, source_range)))
            });
        FormulaSourceChange::fold_table(&mut formulas, &before, Some(&mut after));
        let rules = FormulaRuleChange::prepare(workbook, &|sheet, range, expr| {
            column_changed && renamer.rewrite(expr, Some((sheet, range)))
        });
        let lambdas = FormulaLambdaChange::prepare(workbook, &|expr| {
            column_changed && renamer.rewrite(expr, None)
        });
        Ok(Some(Self {
            sheet,
            range,
            before,
            after: Some(after),
            formulas,
            rules,
            lambdas,
            cells: cells.into_iter().collect(),
        }))
    }
}
