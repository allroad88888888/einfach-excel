//! 工作簿查询只读取原生稀疏数据；分页限制只约束返回列表，不改变查询总数。
use crate::find_format::FindFormatFilter;
use crate::find_text::{utf16_span, FindText};
use crate::{value_to_display, CellAddress, CellRange, Workbook};
use einfach_core::Value;
use std::collections::BTreeMap;
use std::ops::Range;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FindLookIn {
    Values,
    Formulas,
}

#[derive(Clone, Debug)]
pub struct FindQuery {
    pub needle: String,
    pub case_sensitive: bool,
    pub whole_cell: bool,
    pub wildcards: bool,
    pub look_in: FindLookIn,
    pub format: Option<FindFormatFilter>,
}

/// 只传定位所需的信息，不把整份工作簿内容复制到 UI。
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FindMatch {
    pub sheet: usize,
    pub address: CellAddress,
    pub start: usize,
    pub end: usize,
}

#[derive(Debug)]
pub struct FindPage {
    pub total: usize,
    pub matches: Vec<FindMatch>,
}

pub(crate) struct MatchedCell {
    pub sheet: usize,
    pub address: CellAddress,
    pub text: String,
    pub formula: bool,
    pub spans: Vec<Range<usize>>,
}

impl Workbook {
    pub fn find_cells(
        &self,
        targets: &[(usize, CellRange)],
        query: &FindQuery,
        offset: usize,
        limit: usize,
    ) -> Result<FindPage, &'static str> {
        if limit == 0 || limit > 500 {
            return Err("Find page size must be between 1 and 500.");
        }
        let mut page = FindPage {
            total: 0,
            matches: Vec::new(),
        };
        self.for_each_find_cell(targets, query, |cell| {
            for span in &cell.spans {
                if page.total >= offset && page.matches.len() < limit {
                    let span = utf16_span(&cell.text, span);
                    page.matches.push(FindMatch {
                        sheet: cell.sheet,
                        address: cell.address,
                        start: span.start,
                        end: span.end,
                    });
                }
                page.total += 1;
            }
        })?;
        Ok(page)
    }

    pub(crate) fn for_each_find_cell(
        &self,
        targets: &[(usize, CellRange)],
        query: &FindQuery,
        mut visit: impl FnMut(MatchedCell),
    ) -> Result<(), &'static str> {
        let format_filter = query.format.as_ref().filter(|f| !f.is_empty());
        if let Some(filter) = format_filter {
            filter.validate()?;
        }
        let matcher = if query.needle.is_empty() {
            if format_filter.is_none() {
                return Err("Enter text or choose a format to find.");
            }
            None
        } else {
            Some(FindText::new(
                &query.needle,
                query.case_sensitive,
                query.whole_cell,
                query.wildcards,
            )?)
        };
        let mut sheets = BTreeMap::<usize, Vec<CellRange>>::new();
        if targets.is_empty() || targets.len() > 1024 {
            return Err("Choose between 1 and 1024 search ranges.");
        }
        // 先校验全部范围；按表序、行序、列序稳定输出，交叉选区只访问一次。
        for &(sheet, range) in targets {
            if self.sheet(sheet).is_none()
                || range != range.normalize()
                || range.end.row >= 1_048_576
                || range.end.col >= 16_384
            {
                return Err("Invalid search range.");
            }
            sheets.entry(sheet).or_default().push(range);
        }
        let mut error = None;
        for (sheet, ranges) in sheets {
            let mut bounds = ranges[0];
            for range in &ranges[1..] {
                bounds.start.row = bounds.start.row.min(range.start.row);
                bounds.start.col = bounds.start.col.min(range.start.col);
                bounds.end.row = bounds.end.row.max(range.end.row);
                bounds.end.col = bounds.end.col.max(range.end.col);
            }
            let source = self.sheet(sheet).unwrap();
            if let Some(matcher) = &matcher {
                self.for_each_sparse_range_cell(sheet, bounds, |address, value| {
                    if error.is_some() || !ranges.iter().any(|range| range.contains(address)) {
                        return;
                    }
                    if source
                        .merged_range_at(address)
                        .is_some_and(|merged| merged.start != address)
                    {
                        return;
                    }
                    if let Some(filter) = format_filter {
                        if !filter.matches(&source.base_format_at(address)) {
                            return;
                        }
                    }
                    let formula = source.formula_text_at(address);
                    let text = cell_find_text(source, address, query.look_in, formula.as_ref(), &value);
                    let spans = match matcher.spans(&text) {
                        Ok(spans) => spans,
                        Err(message) => {
                            error = Some(message);
                            return;
                        }
                    };
                    if !spans.is_empty() {
                        visit(MatchedCell {
                            sheet,
                            address,
                            text,
                            formula: formula.is_some(),
                            spans,
                        });
                    }
                });
            } else if let Some(filter) = format_filter {
                // Format-only search: visit populated cells AND explicitly styled empty cells
                // in deterministic (row, col) order without materializing unbounded sheet grids.
                let mut candidates = BTreeMap::<(u32, u32), Value>::new();
                self.for_each_sparse_range_cell(sheet, bounds, |address, value| {
                    if ranges.iter().any(|range| range.contains(address)) {
                        candidates.insert((address.row, address.col), value);
                    }
                });
                for &address in source.cell_styles.keys() {
                    if bounds.contains(address) && ranges.iter().any(|range| range.contains(address)) {
                        candidates.entry((address.row, address.col)).or_insert(Value::Null);
                    }
                }
                for &row in source.row_styles.keys() {
                    if row >= bounds.start.row && row <= bounds.end.row {
                        for &col in source.column_styles.keys() {
                            let addr = CellAddress::new(row, col);
                            if bounds.contains(addr) && ranges.iter().any(|r| r.contains(addr)) {
                                candidates.entry((row, col)).or_insert(Value::Null);
                            }
                        }
                    }
                }
                if bounds.cell_count() <= 100_000 {
                    for &row in source.row_styles.keys() {
                        if row >= bounds.start.row && row <= bounds.end.row {
                            for col in bounds.start.col..=bounds.end.col {
                                let addr = CellAddress::new(row, col);
                                if ranges.iter().any(|r| r.contains(addr)) {
                                    candidates.entry((row, col)).or_insert(Value::Null);
                                }
                            }
                        }
                    }
                    for &col in source.column_styles.keys() {
                        if col >= bounds.start.col && col <= bounds.end.col {
                            for row in bounds.start.row..=bounds.end.row {
                                let addr = CellAddress::new(row, col);
                                if ranges.iter().any(|r| r.contains(addr)) {
                                    candidates.entry((row, col)).or_insert(Value::Null);
                                }
                            }
                        }
                    }
                }
                for ((row, col), value) in candidates {
                    let address = CellAddress::new(row, col);
                    if source
                        .merged_range_at(address)
                        .is_some_and(|merged| merged.start != address)
                    {
                        continue;
                    }
                    if !filter.matches(&source.base_format_at(address)) {
                        continue;
                    }
                    let formula = source.formula_text_at(address);
                    let text = cell_find_text(source, address, query.look_in, formula.as_ref(), &value);
                    visit(MatchedCell {
                        sheet,
                        address,
                        spans: vec![0..text.len()],
                        text,
                        formula: formula.is_some(),
                    });
                }
            }
        }
        error.map_or(Ok(()), Err)
    }
}

fn cell_find_text(
    source: &crate::Sheet,
    address: CellAddress,
    look_in: FindLookIn,
    formula: Option<&String>,
    value: &Value,
) -> String {
    match (look_in, formula, value) {
        (FindLookIn::Formulas, Some(formula), _) => formula.clone(),
        // 原始值模式保留往返精度，不能把显示舍入写回原数值。
        (FindLookIn::Formulas, _, Value::Number(number)) => number.to_string(),
        (FindLookIn::Values, _, Value::Number(number)) => {
            source.base_format_at(address).format_number(*number)
        }
        _ => value_to_display(value),
    }
}
