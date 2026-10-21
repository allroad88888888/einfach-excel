//! Table 自有筛选：范围来自表定义，表头与汇总不参加扫描，普通区域条件不受影响。
use super::*;
use crate::filter::SheetAutoFilter;

impl TableEntry {
    pub(super) fn filter_data_range(&self) -> Option<CellRange> {
        let first = self.range.start.row + u32::from(self.has_headers);
        let end = self.range.end.row + 1 - u32::from(self.has_totals);
        if self.insert_row || first >= end { return None; }
        Some(CellRange::new(CellAddress::new(first, self.range.start.col),
            CellAddress::new(end - 1, self.range.end.col)))
    }
}

impl Workbook {
    pub fn apply_table_filter(&mut self, name: &str, rules: &[ColumnFilterRule])
        -> Result<FilterApplyReport, String> {
        let (after, report) = self.prepare_table_filter(name, rules)?;
        self.commit_table_filter(name, after.auto_filter)?;
        Ok(report)
    }

    pub(crate) fn prepare_table_filter(&self, name: &str, rules: &[ColumnFilterRule])
        -> Result<(TableEntry, FilterApplyReport), String> {
        if self.is_inside_custom_call() {
            return Err("Cannot change a table filter during a custom formula call.".into());
        }
        let table = self.get_table(name).ok_or("The table no longer exists.")?;
        let sheet = self.index_of(table.sheet_name()).ok_or("The worksheet no longer exists.")?;
        self.ensure_sheet_unprotected(sheet)?;
        if !table.has_headers && !rules.is_empty() {
            return Err("Show table headers before filtering its columns.".into());
        }
        if rules.iter().any(|rule| rule.col_index() < table.range.start.col ||
            rule.col_index() > table.range.end.col) {
            return Err("Choose a column inside the table.".into());
        }
        let report = self.scan_filter_data(sheet, table.filter_data_range(), rules)
            .map_err(|error| format!("{error:?}"))?;
        let mut after = table.clone();
        after.auto_filter = (!rules.is_empty()).then(|| SheetAutoFilter::new(
            rules.to_vec(), report.hidden_rows.iter().copied().collect()));
        Ok((after, report))
    }

    pub fn clear_table_filter(&mut self, name: &str) -> Result<FilterApplyReport, String> {
        self.apply_table_filter(name, &[])
    }

    /// 编辑不会重跑条件；只有用户重新应用才使用新的单元格值生成隐藏结果。
    pub fn reapply_table_filter(&mut self, name: &str) -> Result<FilterApplyReport, String> {
        let rules = self.get_table(name).ok_or("The table no longer exists.")?
            .auto_filter().map(|filter| filter.rules().to_vec()).unwrap_or_default();
        self.apply_table_filter(name, &rules)
    }

    pub(crate) fn commit_table_filter(&mut self, name: &str, next: Option<SheetAutoFilter>)
        -> Result<bool, String> {
        let table = self.get_table(name).ok_or("The table no longer exists.")?;
        let sheet = self.index_of(table.sheet_name()).ok_or("The worksheet no longer exists.")?;
        self.ensure_sheet_unprotected(sheet)?;
        if table.auto_filter == next { return Ok(false); }
        let arrays = self.array_dependents_for_atoms(&self.atom_context.filter_dependent_atoms());
        let store = self.store.clone();
        store.batch(|_| {
            self.tables.get_mut(&name.to_ascii_uppercase()).unwrap().auto_filter = next;
            self.tables_epoch = self.tables_epoch.wrapping_add(1);
            self.republish_hidden(sheet);
        });
        self.recompute_array_formula_groups(arrays);
        Ok(true)
    }
}
