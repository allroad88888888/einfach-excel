//! 图表公式引用的单元格值：普通图表的 numCache / strCache 与 chartEx 的 `cx:lvl` 共用这一份取值。

use std::collections::HashMap;

use crate::native::{CellValue, Persistence, SparseCell};
use crate::read::charts::formula::parse_formula;

/// 缓存点数上限，超过（整列之类）就不写缓存。
const MAX_POINTS: u64 = 20_000;

pub struct Cells<'a> {
    book: &'a Persistence,
    by_addr: HashMap<(usize, u32, u32), &'a SparseCell>,
}

impl<'a> Cells<'a> {
    pub fn new(book: &'a Persistence) -> Self {
        let by_addr = book.cells.iter().filter(|cell| cell.kind != "error")
            .map(|cell| ((cell.sheet, cell.row, cell.col), cell)).collect();
        Self { book, by_addr }
    }

    /// 公式覆盖的单元格值，按引用顺序（块内逐行）展开；空格为 `None`。公式认不出或太大返回 `None`。
    pub fn values(&self, formula: &str) -> Option<Vec<Option<CellValue>>> {
        let mut out = Vec::new();
        for rect in parse_formula(formula)? {
            let sheet = self.book.sheets.iter().position(|meta| meta.name.eq_ignore_ascii_case(&rect.sheet))?;
            let [r1, c1, r2, c2] = rect.rect;
            if out.len() as u64 + u64::from(r2 - r1 + 1) * u64::from(c2 - c1 + 1) > MAX_POINTS { return None; }
            for row in r1..=r2 {
                for col in c1..=c2 {
                    out.push(self.by_addr.get(&(sheet, row, col)).and_then(|cell| cell.value.clone()));
                }
            }
        }
        Some(out)
    }
}

/// 字符串维度的缓存文本。
pub fn as_text(value: &CellValue) -> Option<String> {
    match value {
        CellValue::Number(n) => Some(n.to_string()),
        CellValue::Boolean(b) => Some(if *b { "TRUE" } else { "FALSE" }.into()),
        CellValue::Text(t) if !t.is_empty() => Some(t.clone()),
        CellValue::Text(_) => None,
    }
}

/// 数值维度的缓存文本：只有数字。
pub fn as_number(value: &CellValue) -> Option<String> {
    match value {
        CellValue::Number(n) if n.is_finite() => Some(n.to_string()),
        _ => None,
    }
}
