//! 低层汇总操作与用户历史操作共用预检、原子提交；这里不另存汇总配置。
use super::*;

impl Workbook {
    /// 仅投影：从真实公式派生菜单选项；None 表示自定义内容，不另存配置。
    pub fn table_total_functions(
        &self,
        name: &str,
    ) -> Result<Vec<Option<TotalsFunction>>, TableError> {
        let table = self.get_table(name).ok_or(TableError::NotFound)?;
        if !table.has_totals() {
            return Ok(Vec::new());
        }
        let sheet = self
            .index_of(table.sheet_name())
            .ok_or(TableError::SheetNotFound)?;
        let target = &self.sheets[sheet];
        Ok(table
            .columns()
            .iter()
            .enumerate()
            .map(|(index, column)| {
                let addr = CellAddress::new(
                    table.range().end.row,
                    table.range().start.col + index as u32,
                );
                match target.formula_text_at(addr) {
                    Some(source) => total_function_from_source(&source, table.name(), column),
                    None if target.peek_value(addr) == Value::Null => Some(TotalsFunction::None),
                    None => None,
                }
            })
            .collect())
    }

    pub fn set_table_totals_row(&mut self, name: &str, enabled: bool) -> Result<(), TableError> {
        if let Some(change) = TableDefinitionChange::prepare_totals_row(self, name, enabled)? {
            change
                .apply(self, false)
                .map_err(|_| TableError::FormulaRewriteConflict)?;
        }
        Ok(())
    }

    /// 写入或清除真实 SUBTOTAL 公式；不另存一份函数配置。
    pub fn set_table_total_function(
        &mut self,
        name: &str,
        column: &str,
        function: TotalsFunction,
    ) -> Result<(), TableError> {
        if let Some(change) =
            TableDefinitionChange::prepare_total_function(self, name, column, function)?
        {
            change
                .apply(self, false)
                .map_err(|_| TableError::FormulaRewriteConflict)?;
        }
        Ok(())
    }
}

fn total_function_from_source(
    source: &str,
    table_name: &str,
    column: &str,
) -> Option<TotalsFunction> {
    let Expr::FuncCall { name, args } = parse_formula(source)? else {
        return None;
    };
    let [Expr::Number(code), Expr::TableRef {
        table,
        area,
        columns: Some((start, end)),
    }] = args.as_slice()
    else {
        return None;
    };
    if name != "SUBTOTAL"
        || *area != crate::TableArea::Data
        || table
            .as_ref()
            .is_some_and(|name| !name.eq_ignore_ascii_case(table_name))
        || !start.eq_ignore_ascii_case(column)
        || !end.eq_ignore_ascii_case(column)
    {
        return None;
    }
    [
        TotalsFunction::Average,
        TotalsFunction::Count,
        TotalsFunction::CountNums,
        TotalsFunction::Max,
        TotalsFunction::Min,
        TotalsFunction::Sum,
        TotalsFunction::StdDev,
        TotalsFunction::Var,
    ]
    .into_iter()
    .find(|function| {
        function
            .subtotal_code()
            .is_some_and(|value| value as f64 == *code)
    })
}
