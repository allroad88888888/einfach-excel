//! 列值选择器：从原生筛选作用域读取完整候选，查询不提交筛选或创建历史。
use super::*;
use crate::advanced_filter::{ColumnFilterGroup, FilterCriteria, MAX_SELECTION_BYTES};

/// 普通区域使用已提交的范围；Table 通过名称解析，前端不复制其几何。
pub struct FilterValuesQuery<'a> {
    pub column: u32,
    pub table: Option<&'a str>,
    pub search: &'a str,
    pub offset: u32,
    pub limit: u32,
}

#[derive(Debug, PartialEq, Eq)]
pub struct FilterValueEntry {
    /// 与 List 条件使用同一原生文本；空白是空串，换行不能拆成多个候选。
    pub value: String,
    pub count: u32,
}

#[derive(Debug, Default, PartialEq, Eq)]
pub struct FilterValuesPage {
    pub values: Vec<FilterValueEntry>,
    /// 搜索后的候选总数，不是当前页长度；超出扫描预算时报错，不截断。
    pub total: u32,
    pub offset: u32,
}

impl Workbook {
    pub fn filter_values(&self, sheet: usize, query: FilterValuesQuery<'_>)
        -> Result<FilterValuesPage, String> {
        self.filter_values_query(sheet, query, false)
    }

    /// One bounded scan returns complete search membership, never a truncated "all" result.
    pub fn filter_all_values(&self, sheet: usize, query: FilterValuesQuery<'_>)
        -> Result<FilterValuesPage, String> {
        if query.offset != 0 { return Err("Search selection must start at the first match.".into()); }
        self.filter_values_query(sheet, query, true)
    }

    fn filter_values_query(&self, sheet: usize, query: FilterValuesQuery<'_>, all: bool)
        -> Result<FilterValuesPage, String> {
        if self.is_inside_custom_call() {
            return Err("Cannot browse filter values during a custom formula call.".into());
        }
        let source = self.sheet(sheet).ok_or("The worksheet no longer exists.")?;
        if query.column >= crate::sheet::EXCEL_MAX_COLS || !(1..=100).contains(&query.limit)
            || query.search.encode_utf16().count() > 32767 {
            return Err("Choose a valid column, search text and page size (1–100).".into());
        }
        let (data, filter) = if let Some(name) = query.table {
            let table = self.get_table(name).ok_or("The table no longer exists.")?;
            if self.index_of(table.sheet_name()) != Some(sheet) || !table.has_headers
                || query.column < table.range.start.col || query.column > table.range.end.col {
                return Err("Choose a column in a table with visible headers on this worksheet.".into());
            }
            (table.filter_data_range(), table.auto_filter())
        } else {
            let data = if let Some(range) = self.filter_range(sheet) {
                if query.column < range.start.col || query.column > range.end.col {
                    return Err("Choose a column inside the filter range.".into());
                }
                Some(CellRange::new(CellAddress::new(range.start.row + 1, range.start.col), range.end))
            } else { self.filter_values_used_range(sheet) };
            (data, source.filter())
        };
        let Some(data) = data else { return Ok(FilterValuesPage::default()); };
        // 当前列条件不能限制自己的候选；其它列继续复用原生谓词，绝不在 JS 重算。
        let other_rules: Vec<_> = filter.into_iter().flat_map(|filter| filter.rules())
            .filter(|rule| rule.col_index() != query.column).cloned().collect();
        let groups: Vec<_> = filter.into_iter().flat_map(|filter| filter.groups()).map(|group|
            ColumnFilterGroup { rules: group.rules.iter().filter(|rule| rule.col_index() != query.column)
                .cloned().collect() }).collect();
        // Removing the queried column may empty an OR branch. For candidate browsing
        // that branch is unrestricted, unlike an invalid empty committed group.
        let criteria = if groups.is_empty() || groups.iter().any(|group| group.rules.is_empty()) {
            FilterCriteria::Flat(&other_rules)
        } else { FilterCriteria::Groups(&groups) };
        let mut columns = criteria.columns();
        columns.insert(query.column);
        if data.rows().saturating_mul(columns.len() as u32) > crate::filter::MAX_FILTER_PREDICATE_CELLS {
            return Err("Filter values exceed the 50,000-cell scan budget. Select a smaller filter range.".into());
        }
        let mut excluded: BTreeSet<_> = self.scan_filter_data_criteria(sheet, Some(data), criteria)
            .map_err(|error| format!("{error:?}"))?.hidden_rows.into_iter().collect();
        // 其它作用域只读上次提交的隐藏快照；查询不会偷偷重新应用它们。
        if query.table.is_some() {
            if let Some(filter) = source.filter() { excluded.extend(filter.hidden_set()); }
        }
        for table in self.tables.values().filter(|table| self.index_of(table.sheet_name()) == Some(sheet)) {
            if query.table.is_some_and(|name| table.name().eq_ignore_ascii_case(name)) { continue; }
            if let Some(filter) = table.auto_filter() { excluded.extend(filter.hidden_set()); }
        }
        let mut values = HashMap::new();
        let column = CellRange::new(CellAddress::new(data.start.row, query.column),
            CellAddress::new(data.end.row, query.column));
        self.for_each_sparse_range_cell(sheet, column, |addr, value| {
            values.insert(addr.row, crate::value_to_display(&value));
        });
        self.store.settle_pending_reads();
        let mut counts = BTreeMap::<String, u32>::new();
        for row in data.start.row..=data.end.row {
            if !excluded.contains(&row) { *counts.entry(values.remove(&row).unwrap_or_default()).or_default() += 1; }
        }
        let search = query.search.to_lowercase();
        counts.retain(|value, _| value.to_lowercase().contains(&search));
        let total = counts.len() as u32;
        if all && (total > 1000 || counts.keys().map(|value| value.len() + 24).sum::<usize>() > MAX_SELECTION_BYTES
            || counts.keys().any(|value| value.encode_utf16().count() > 32767)) {
            return Err("All search matches exceed the 1,000-value or 1 MiB selection budget. Narrow the search.".into());
        }
        let offset = query.offset.min(total);
        let limit = if all { total } else { query.limit };
        let values = counts.into_iter().skip(offset as usize).take(limit as usize)
            .map(|(value, count)| FilterValueEntry { value, count }).collect();
        Ok(FilterValuesPage { values, total, offset })
    }

    /// 与无显式区域的既有筛选一致：首行是表头，末行 Total/Summary 不参与。
    fn filter_values_used_range(&self, sheet: usize) -> Option<CellRange> {
        let source = self.sheet(sheet)?;
        let mut last = 0;
        source.for_each_non_empty(|addr| last = last.max(addr.row));
        if last == 0 { return None; }
        let addr = CellAddress::new(last, 0);
        let mut label = String::new();
        self.for_each_sparse_range_cell(sheet, CellRange::new(addr, addr), |_, value| {
            label = crate::value_to_display(&value);
        });
        self.store.settle_pending_reads();
        if crate::filter::is_filter_sort_summary_row(&label, last) { last -= 1; }
        Some(CellRange::new(CellAddress::new(1, 0), CellAddress::new(last, crate::sheet::EXCEL_MAX_COLS - 1)))
    }
}
