//! Table 范围变更预检；重叠列保留身份，新列只规范化自己的表头。
use super::*;
use crate::CellSnapshot;

impl TableDefinitionChange {
    pub(crate) fn prepare_resize(
        workbook: &Workbook,
        name: &str,
        range: CellRange,
    ) -> Result<Option<Self>, String> {
        if workbook.is_inside_custom_call() {
            return Err("Cannot resize a table during a custom call.".into());
        }
        let before = workbook
            .get_table(name)
            .ok_or("The table no longer exists.")?
            .clone();
        let sheet = workbook
            .index_of(before.sheet_name())
            .ok_or("The worksheet no longer exists.")?;
        let range = range.normalize();
        if range.start.row != before.range.start.row || !range.intersects(before.range) {
            return Err(
                "Keep the table header on its original row and overlap the original table.".into(),
            );
        }
        // 空数据区合法；但表头与汇总不能挤到同一行。
        if range.rows() < (u32::from(before.has_headers) + u32::from(before.has_totals)).max(1) {
            return Err("The range cannot contain both the header and totals rows.".into());
        }
        validate_cells(workbook, sheet, range)?;
        if workbook.tables.values().any(|table| {
            !table.name().eq_ignore_ascii_case(name)
                && table.sheet_name() == before.sheet_name()
                && table.range().intersects(range)
        }) {
            return Err("The resized range overlaps another table.".into());
        }
        if range == before.range {
            return Ok(None);
        }
        let mut after = before.clone();
        after.range = range;
        // 待输入行只属于零记录表；显式加行会创建记录，缩掉它则只剩表头/汇总。
        after.insert_row = before.insert_row
            && range.rows() == 1 + u32::from(after.has_headers) + u32::from(after.has_totals)
            && !workbook.insert_row_has_content(&after);
        after.clip_filter();
        after.columns.clear();
        // 按工作表列坐标保留标准公式；新列为空，缩掉的列不留下错位定义。
        if !before.calculated_columns.is_empty() {
            after.calculated_columns = (range.start.col..=range.end.col).map(|col| {
                col.checked_sub(before.range.start.col)
                    .and_then(|offset| before.calculated_columns.get(offset as usize))
                    .cloned().flatten()
            }).collect();
        }
        // 先保留所有旧列名，向左扩展也不能夺走右侧保留列的名称。
        let mut used: HashSet<_> = before
            .columns
            .iter()
            .map(|name| name.to_ascii_uppercase())
            .collect();
        for col in range.start.col..=range.end.col {
            let name = if col >= before.range.start.col && col <= before.range.end.col {
                before.columns[(col - before.range.start.col) as usize].clone()
            } else {
                let raw = if before.has_headers {
                    workbook
                        .header_text(before.sheet_name(), CellAddress::new(range.start.row, col))
                } else {
                    String::new()
                };
                let name = raw.trim();
                let name = if name.is_empty() || used.contains(&name.to_ascii_uppercase()) {
                    next_auto_column_name(&used)
                } else {
                    name.to_owned()
                };
                used.insert(name.to_ascii_uppercase());
                name
            };
            after.columns.push(name);
        }
        let removed: Vec<_> = before
            .columns
            .iter()
            .enumerate()
            .filter_map(|(offset, name)| {
                let col = before.range.start.col + offset as u32;
                (col < range.start.col || col > range.end.col).then(|| name.clone())
            })
            .collect();
        let resolved = before.to_resolved(sheet);
        let removes_columns = !removed.is_empty();
        let columns = crate::shift::TableColumnEdit {
            table: &resolved,
            spec: crate::shift::TableRefEditSpec::RemoveColumns {
                table_upper: before.name().to_ascii_uppercase(),
                columns: removed,
            },
        };
        let mut cells = Vec::new();
        if before.has_headers {
            if range.start.col < before.range.start.col {
                cells.push(new_headers(
                    workbook,
                    sheet,
                    &after,
                    range.start.col,
                    before.range.start.col - 1,
                ));
            }
            if range.end.col > before.range.end.col {
                cells.push(new_headers(
                    workbook,
                    sheet,
                    &after,
                    before.range.end.col + 1,
                    range.end.col,
                ));
            }
        }
        cells.extend(resize_totals::prepare(
            workbook, sheet, &before, &after, &columns,
        )?);
        // 加行/加列只变原生几何，交给已有 atom 依赖失效；没有删列就不扫描公式源码。
        let (mut formulas, rules, lambdas) = if removes_columns {
            let formulas =
                FormulaSourceChange::prepare(workbook, &|source_sheet, source_range, template, expr| {
                    // 局部快照已拥有被改写的格，不能再由公式历史写第二遍。
                    !(template.is_none() && source_sheet == sheet
                        && cells
                            .iter()
                            .any(|(old, _)| old.range.intersects(source_range)))
                        && columns.rewrite(expr, Some((source_sheet, source_range)))
                });
            let rules = FormulaRuleChange::prepare(workbook, &|sheet, range, expr| {
                columns.rewrite(expr, Some((sheet, range)))
            });
            let lambdas =
                FormulaLambdaChange::prepare(workbook, &|expr| columns.rewrite(expr, None));
            (formulas, rules, lambdas)
        } else {
            (Vec::new(), Vec::new(), Vec::new())
        };
        FormulaSourceChange::fold_table(&mut formulas, &before, Some(&mut after));
        Ok(Some(Self {
            sheet,
            range,
            before,
            after: Some(after),
            formulas,
            rules,
            lambdas,
            cells,
            filter: None,
            named_ranges: Vec::new(),
            shifted_tables: Vec::new(),
            validations: ValidationShift::default(),
        }))
    }
}

fn new_headers(
    workbook: &Workbook,
    sheet: usize,
    after: &TableEntry,
    start: u32,
    end: u32,
) -> (HistorySnapshot, HistorySnapshot) {
    let row = after.range.start.row;
    let range = CellRange::new(CellAddress::new(row, start), CellAddress::new(row, end));
    let original = HistorySnapshot::capture(&workbook.sheets[sheet], range, true);
    let mut next = original.clone();
    next.cells = Some(
        (start..=end)
            .map(|col| {
                CellSnapshot::value(
                    CellAddress::new(row, col),
                    Value::Text(after.columns[(col - after.range.start.col) as usize].clone()),
                )
            })
            .collect(),
    );
    (original, next)
}
