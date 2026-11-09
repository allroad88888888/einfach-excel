//! 图表数据源（载荷 `source`）→ 当前的数据区域。`refs` 只是用户上次应用数据源时解析出的快照，
//! 表后来长大了就会过期，所以导出时按工作簿里现在的表 / 命名区域重新解析。纯函数，不碰 XML。
//!
//! 语法（名字不分大小写）：`Sales`（命名区域，先本表作用域再工作簿作用域；都没有再当表名）、
//! `Data!Sales` / `'My data'!Sales`（该表作用域的名字，回落工作簿作用域，不找表）、
//! `Table1`（整表含表头、不含汇总行）、`Table1[Col]` / `Table1[[Col]]`、`Table1[[A]:[B]]`。
//! 解析不了一律返回 None，调用方沿用 `refs`。

use crate::address::parse_range;
use crate::native::{NamedRange, Persistence, Table};
use crate::native_drawings::NativeRange;

/// 取图表实际使用的区域：`payload.source` 非空且能解析时用解析结果，否则原样用 `refs`。
pub fn effective_refs(
    payload: &serde_json::Value,
    refs: &[Option<NativeRange>],
    book: &Persistence,
    own_sheet: usize,
) -> Vec<Option<NativeRange>> {
    let source = payload.get("source").and_then(|value| value.as_str()).unwrap_or("").trim();
    if source.is_empty() { return refs.to_vec(); }
    match resolve(source, book, own_sheet) {
        Some(range) => vec![Some(range)],
        None => refs.to_vec(),
    }
}

/// `own_sheet` 是图表所在工作表的下标。结果带上目标表名（可能不是图表所在的表）。
pub fn resolve(source: &str, book: &Persistence, own_sheet: usize) -> Option<NativeRange> {
    let source = source.trim();
    if let Some((sheet, name)) = split_sheet(source) {
        let scope = book.sheets.iter().position(|meta| meta.name.eq_ignore_ascii_case(&sheet))?;
        return name_range(book, name, &[Some(scope), None]);
    }
    match source.find('[') {
        Some(at) => {
            let table = find_table(book, &source[..at])?;
            let (from, to) = columns(&source[at..])?;
            table_range(book, table, Some((&from, &to)))
        }
        None => {
            if let Some(found) = name_range_if_named(book, source, &[Some(own_sheet), None]) {
                return found;
            }
            table_range(book, find_table(book, source)?, None)
        }
    }
}

/// `Data!Sales` / `'My data'!Sales` → (表名, 名字)；`!` 出现在 `[` 之后不算（列名里可能有 `!`）。
fn split_sheet(source: &str) -> Option<(String, &str)> {
    if let Some(rest) = source.strip_prefix('\'') {
        let mut sheet = String::new();
        let mut chars = rest.char_indices();
        while let Some((at, c)) = chars.next() {
            if c != '\'' { sheet.push(c); continue; }
            if rest[at + 1..].starts_with('\'') { sheet.push('\''); chars.next(); continue; }
            return rest[at + 1..].strip_prefix('!').map(|name| (sheet, name.trim()));
        }
        return None;
    }
    let bang = source.find('!')?;
    if source.find('[').is_some_and(|open| open < bang) { return None; }
    Some((source[..bang].trim().to_string(), source[bang + 1..].trim()))
}

/// 按作用域优先级找同名命名区域；找到名字就以它为准（公式 / 常量名返回 None，不再往后找）。
fn name_range_if_named(book: &Persistence, name: &str, scopes: &[Option<usize>]) -> Option<Option<NativeRange>> {
    let found = scopes.iter().find_map(|scope| {
        book.named_ranges.iter().find(|n| n.scope == *scope && n.name.eq_ignore_ascii_case(name))
    })?;
    Some(named_target(book, found))
}

fn name_range(book: &Persistence, name: &str, scopes: &[Option<usize>]) -> Option<NativeRange> {
    name_range_if_named(book, name, scopes)?
}

fn named_target(book: &Persistence, named: &NamedRange) -> Option<NativeRange> {
    if named.formula.is_some() { return None; }
    let target = named.target.as_ref()?;
    let [r1, c1, r2, c2] = target.range;
    Some(NativeRange {
        start_row: r1.min(r2), start_col: c1.min(c2), end_row: r1.max(r2), end_col: c1.max(c2),
        sheet_name: Some(book.sheets.get(target.sheet)?.name.clone()),
    })
}

fn find_table<'a>(book: &'a Persistence, name: &str) -> Option<&'a Table> {
    book.tables.iter().find(|table| table.name.eq_ignore_ascii_case(name.trim()))
}

/// 表的区域：含表头、去掉汇总行；`span` 给定时只取这些列（顺序无关）。
fn table_range(book: &Persistence, table: &Table, span: Option<(&str, &str)>) -> Option<NativeRange> {
    let [r1, c1, r2, c2] = parse_range(&table.range)?;
    let last = if table.has_totals && r2 > r1 { r2 - 1 } else { r2 };
    let (from, to) = match span {
        None => (c1, c2),
        Some((a, b)) => {
            let (a, b) = (column_at(table, a)?, column_at(table, b)?);
            (c1 + a.min(b), c1 + a.max(b))
        }
    };
    if to > c2 { return None; }
    let sheet = book.sheets.get(table.sheet_index as usize)?;
    Some(NativeRange { start_row: r1, start_col: from, end_row: last, end_col: to, sheet_name: Some(sheet.name.clone()) })
}

fn column_at(table: &Table, name: &str) -> Option<u32> {
    table.columns.iter().position(|column| column.eq_ignore_ascii_case(name)).map(|at| at as u32)
}

/// `[Col]` / `[[Col]]` / `[[A]:[B]]` → (起始列名, 结束列名)。
fn columns(text: &str) -> Option<(String, String)> {
    let inner = match text.strip_prefix("[[") {
        Some(_) => text.strip_prefix('[')?.strip_suffix(']')?,
        None => text,
    };
    let (first, rest) = bracketed(inner)?;
    if rest.is_empty() { return Some((first.clone(), first)); }
    let (second, rest) = bracketed(rest.strip_prefix(':')?)?;
    rest.is_empty().then_some((first, second))
}

/// 读一个 `[...]`（`'` 转义下一个字符），返回内容与剩余文本。`[#Data]` 之类的特殊项不支持。
fn bracketed(text: &str) -> Option<(String, &str)> {
    let rest = text.strip_prefix('[')?;
    let mut name = String::new();
    let mut chars = rest.char_indices();
    while let Some((at, c)) = chars.next() {
        match c {
            '\'' => name.push(chars.next()?.1),
            ']' => return (!name.is_empty() && !name.starts_with('#')).then(|| (name, &rest[at + 1..])),
            _ => name.push(c),
        }
    }
    None
}

#[cfg(test)]
#[path = "source_tests.rs"]
mod tests;
