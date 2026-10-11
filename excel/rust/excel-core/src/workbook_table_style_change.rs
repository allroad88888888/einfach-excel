//! 样式历史只记录 Table 元数据，不复制数据区或改写公式。
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
        let sheet = workbook
            .index_of(before.sheet_name())
            .ok_or("The worksheet no longer exists.")?;
        let mut after = before.clone();
        after.style = style;
        Ok(Some(Self {
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
        }))
    }
}
