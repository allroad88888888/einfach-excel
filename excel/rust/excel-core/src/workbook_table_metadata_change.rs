//! 仅修改 Table 元数据的历史计划；样式与筛选均不复制数据区或重写公式。
use super::*;
use crate::TableStyle;

impl TableDefinitionChange {
    pub(crate) fn prepare_style(
        workbook: &Workbook,
        name: &str,
        style: TableStyle,
    ) -> Result<Option<Self>, String> {
        if workbook.is_inside_custom_call() {
            return Err("Cannot style a table during a custom call.".into());
        }
        let before = workbook
            .get_table(name)
            .ok_or("The table no longer exists.")?
            .clone();
        if before.style == style {
            return Ok(None);
        }
        let mut after = before.clone();
        after.style = style;
        Ok(Some(Self::metadata_change(workbook, before, after)?))
    }

    pub(crate) fn prepare_filter(workbook: &Workbook, name: &str, rules: &[ColumnFilterRule])
        -> Result<(Option<Self>, FilterApplyReport), String> {
        let (after, report) = workbook.prepare_table_filter(name, rules)?;
        let before = workbook.get_table(name).unwrap().clone();
        let change = if before == after { None }
            else { Some(Self::metadata_change(workbook, before, after)?) };
        Ok((change, report))
    }

    fn metadata_change(workbook: &Workbook, before: TableEntry, after: TableEntry) -> Result<Self, String> {
        let sheet = workbook.index_of(before.sheet_name()).ok_or("The worksheet no longer exists.")?;
        let change = Self {
            sheet,
            range: before.range(),
            before,
            after: Some(after),
            formulas: Vec::new(),
            rules: Vec::new(),
            lambdas: Vec::new(),
            cells: Vec::new(),
            filter: None,
            named_ranges: Vec::new(),
            shifted_tables: Vec::new(),
            validations: ValidationShift::default(),
        };
        if change.retained_bytes() > crate::workbook_history::MAX_BYTES {
            return Err("The table change exceeds the 32 MiB undo budget.".into());
        }
        Ok(change)
    }
}
