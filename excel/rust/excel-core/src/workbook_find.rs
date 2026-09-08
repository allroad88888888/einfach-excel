//! 工作簿查询只读取原生稀疏数据；分页限制只约束返回列表，不改变查询总数。
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
        let matcher = FindText::new(
            &query.needle,
            query.case_sensitive,
            query.whole_cell,
            query.wildcards,
        )?;
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
            self.for_each_sparse_range_cell(sheet, bounds, |address, value| {
                if error.is_some() || !ranges.iter().any(|range| range.contains(address)) {
                    return;
                }
                let formula = source.formula_text_at(address);
                let text = match (query.look_in, formula.as_ref(), &value) {
                    (FindLookIn::Formulas, Some(formula), _) => formula.clone(),
                    // 原始值模式保留往返精度，不能把显示舍入写回原数值。
                    (FindLookIn::Formulas, _, Value::Number(number)) => number.to_string(),
                    (FindLookIn::Values, _, Value::Number(number)) => source
                        .effective_format(&address.to_string())
                        .format_number(*number),
                    _ => value_to_display(&value),
                };
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
        }
        error.map_or(Ok(()), Err)
    }
}
