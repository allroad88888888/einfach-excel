//! 图表公式 `Sheet!$B$2:$B$5` / `'My Sheet'!$B$2` / 并集 `(A!$B$2:$B$5,A!$B$9:$B$12)`。
//! 外部工作簿引用、整行整列、定义名一律当作"不认识"，调用方据此跳过整张图表。

use crate::address::parse_cell;

/// 一块带表名的矩形，零基 `[start_row, start_col, end_row, end_col]`，含两端。
/// `sheet` 为空表示公式没写表名（按对象所在表）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SheetRect {
    pub sheet: String,
    pub rect: [u32; 4],
}

impl SheetRect {
    pub fn width(&self) -> u32 { self.rect[3] - self.rect[1] + 1 }
    pub fn height(&self) -> u32 { self.rect[2] - self.rect[0] + 1 }

    /// 行列互换（按行系列先转置成按列再处理）。
    pub fn swapped(&self) -> Self {
        let [r1, c1, r2, c2] = self.rect;
        Self { sheet: self.sheet.clone(), rect: [c1, r1, c2, r2] }
    }
}

pub fn same_sheet(a: &str, b: &str) -> bool {
    a.eq_ignore_ascii_case(b)
}

/// `None`：外部引用或认不出的写法。
pub fn parse_formula(text: &str) -> Option<Vec<SheetRect>> {
    let text = text.trim();
    let inner = text.strip_prefix('(').and_then(|rest| rest.strip_suffix(')')).unwrap_or(text);
    let rects = split_top_level(inner).iter().map(|part| parse_part(part.trim())).collect::<Option<Vec<_>>>()?;
    (!rects.is_empty()).then_some(rects)
}

/// 按不在引号内的逗号切开。
fn split_top_level(text: &str) -> Vec<&str> {
    let mut parts = Vec::new();
    let (mut quoted, mut start) = (false, 0);
    for (index, ch) in text.char_indices() {
        match ch {
            '\'' => quoted = !quoted,
            ',' if !quoted => {
                parts.push(&text[start..index]);
                start = index + 1;
            }
            _ => {}
        }
    }
    parts.push(&text[start..]);
    parts
}

fn parse_part(part: &str) -> Option<SheetRect> {
    let (sheet, reference) = split_sheet(part)?;
    if sheet.contains('[') {
        return None;
    }
    let plain = reference.replace('$', "");
    let (start, end) = plain.split_once(':').unwrap_or((&plain, &plain));
    let (r1, c1) = parse_cell(start)?;
    let (r2, c2) = parse_cell(end)?;
    Some(SheetRect { sheet, rect: [r1.min(r2), c1.min(c2), r1.max(r2), c1.max(c2)] })
}

/// 拆出表名（去引号、`''` 还原成 `'`）与引用部分。
fn split_sheet(part: &str) -> Option<(String, &str)> {
    if let Some(rest) = part.strip_prefix('\'') {
        let mut name = String::new();
        let mut chars = rest.char_indices().peekable();
        while let Some((index, ch)) = chars.next() {
            if ch != '\'' {
                name.push(ch);
            } else if matches!(chars.peek(), Some((_, '\''))) {
                name.push('\'');
                chars.next();
            } else {
                return rest[index + 1..].strip_prefix('!').map(|reference| (name, reference));
            }
        }
        return None;
    }
    match part.split_once('!') {
        Some((sheet, reference)) => Some((sheet.to_string(), reference)),
        None => Some((String::new(), part)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rect(sheet: &str, rect: [u32; 4]) -> SheetRect {
        SheetRect { sheet: sheet.into(), rect }
    }

    #[test]
    fn reads_plain_quoted_single_cell_and_union_references() {
        assert_eq!(parse_formula("Sheet1!$B$2:$B$5"), Some(vec![rect("Sheet1", [1, 1, 4, 1])]));
        assert_eq!(parse_formula("'Sales data'!$A$1"), Some(vec![rect("Sales data", [0, 0, 0, 0])]));
        assert_eq!(parse_formula("'It''s, ok'!B2:C3"), Some(vec![rect("It's, ok", [1, 1, 2, 2])]));
        assert_eq!(
            parse_formula("(Data!$B$2:$B$5,'Data'!$B$9:$B$12)"),
            Some(vec![rect("Data", [1, 1, 4, 1]), rect("Data", [8, 1, 11, 1])])
        );
        assert_eq!(parse_formula("$A$1:$A$3"), Some(vec![rect("", [0, 0, 2, 0])]));
    }

    #[test]
    fn external_whole_column_and_named_references_are_not_understood() {
        for text in ["[1]Sheet1!$A$1:$A$3", "'[1]Sheet 1'!$A$1", "Sheet1!$A:$A", "Sheet1!MyName", "'broken!A1"] {
            assert_eq!(parse_formula(text), None, "{text}");
        }
    }
}
