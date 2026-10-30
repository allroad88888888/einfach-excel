//! 公式文本在 XLSX 与原生之间的转换：`=` 前缀、新函数的 `_xlfn.` 前缀、共享公式的引用平移。

/// Excel 2010 之后加入的函数在文件里要带 `_xlfn.`（FILTER/SORT 另带 `_xlws.`），
/// 否则旧版与 Excel 本身都会把它读成 `#NAME?`。
const FUTURE_FUNCTIONS: &[&str] = &[
    "AGGREGATE", "ARRAYTOTEXT", "BYCOL", "BYROW", "CEILING.MATH", "CHOOSECOLS", "CHOOSEROWS",
    "CONCAT", "DROP", "EXPAND", "FLOOR.MATH", "HSTACK", "IFNA", "IFS", "ISOMITTED", "LAMBDA",
    "LET", "MAKEARRAY", "MAP", "MAXIFS", "MINIFS", "RANDARRAY", "REDUCE", "SCAN", "SEQUENCE",
    "SORTBY", "STDEV.P", "STDEV.S", "SWITCH", "TAKE", "TEXTAFTER", "TEXTBEFORE", "TEXTJOIN",
    "TEXTSPLIT", "TOCOL", "TOROW", "UNIQUE", "VALUETOTEXT", "VAR.P", "VAR.S", "VSTACK",
    "WRAPCOLS", "WRAPROWS", "XLOOKUP", "XMATCH", "XOR",
];
const WORKSHEET_FUNCTIONS: &[&str] = &["FILTER", "SORT"];

fn identifier_char(c: char) -> bool {
    c.is_alphanumeric() || c == '_' || c == '.'
}

/// 逐段扫描公式，跳过字符串与带引号的表名，对其余文本里的每个"标识符"调用 `map`。
fn map_tokens(formula: &str, mut map: impl FnMut(&str, Option<char>) -> String) -> String {
    let chars: Vec<char> = formula.chars().collect();
    let mut out = String::with_capacity(formula.len() + 8);
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if c == '"' || c == '\'' {
            let start = i;
            i += 1;
            while i < chars.len() {
                if chars[i] == c {
                    // 引号内连写两个表示转义。
                    if chars.get(i + 1) == Some(&c) {
                        i += 2;
                        continue;
                    }
                    break;
                }
                i += 1;
            }
            i = (i + 1).min(chars.len());
            out.extend(&chars[start..i]);
        } else if identifier_char(c) || c == '$' {
            let start = i;
            while i < chars.len() && (identifier_char(chars[i]) || chars[i] == '$') {
                i += 1;
            }
            let token: String = chars[start..i].iter().collect();
            out.push_str(&map(&token, chars.get(i).copied()));
        } else {
            out.push(c);
            i += 1;
        }
    }
    out
}

pub fn from_xlsx(formula: &str) -> String {
    let body = map_tokens(formula.trim_start_matches('='), |token, _| {
        token
            .strip_prefix("_xlfn._xlws.")
            .or_else(|| token.strip_prefix("_xlfn."))
            .or_else(|| token.strip_prefix("_xlws."))
            .or_else(|| token.strip_prefix("_xlpm."))
            .unwrap_or(token)
            .to_string()
    });
    format!("={body}")
}

pub fn to_xlsx(formula: &str) -> String {
    map_tokens(formula.strip_prefix('=').unwrap_or(formula), |token, next| {
        let upper = token.to_ascii_uppercase();
        if next != Some('(') {
            token.to_string()
        } else if WORKSHEET_FUNCTIONS.contains(&upper.as_str()) {
            format!("_xlfn._xlws.{token}")
        } else if FUTURE_FUNCTIONS.contains(&upper.as_str()) {
            format!("_xlfn.{token}")
        } else {
            token.to_string()
        }
    })
}

/// `$A$1`/`B7` 形式的单格引用；返回 (列绝对, 列, 行绝对, 行)。
fn parse_reference(token: &str) -> Option<(bool, u32, bool, u32)> {
    let (col_abs, rest) = token.strip_prefix('$').map_or((false, token), |rest| (true, rest));
    let split = rest.find(|c: char| !c.is_ascii_alphabetic())?;
    let (letters, rest) = rest.split_at(split);
    let (row_abs, digits) = rest.strip_prefix('$').map_or((false, rest), |rest| (true, rest));
    if digits.is_empty() || !digits.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    let col = crate::address::parse_column(letters)?;
    let row: u32 = digits.parse().ok()?;
    (col < crate::native::MAX_COLS && (1..=crate::native::MAX_ROWS).contains(&row))
        .then(|| (col_abs, col, row_abs, row - 1))
}

/// 共享公式的从属格：把主格公式里的相对引用平移 (行差, 列差)。越界引用写成 `#REF!`。
pub fn shift(formula: &str, rows: i64, cols: i64) -> String {
    map_tokens(formula, |token, next| {
        if next == Some('(') {
            return token.to_string();
        }
        let Some((col_abs, col, row_abs, row)) = parse_reference(token) else {
            return token.to_string();
        };
        let col = if col_abs { i64::from(col) } else { i64::from(col) + cols };
        let row = if row_abs { i64::from(row) } else { i64::from(row) + rows };
        if !(0..i64::from(crate::native::MAX_COLS)).contains(&col) ||
            !(0..i64::from(crate::native::MAX_ROWS)).contains(&row) {
            return "#REF!".into();
        }
        format!(
            "{}{}{}{}",
            if col_abs { "$" } else { "" },
            crate::address::column_name(col as u32),
            if row_abs { "$" } else { "" },
            row + 1
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_and_adds_future_function_prefixes() {
        assert_eq!(from_xlsx("_xlfn.XLOOKUP(A1,B:B,C:C)"), "=XLOOKUP(A1,B:B,C:C)");
        assert_eq!(from_xlsx("_xlfn._xlws.FILTER(A1:A9,B1:B9>0)"), "=FILTER(A1:A9,B1:B9>0)");
        assert_eq!(to_xlsx("=FILTER(A1:A9,XLOOKUP(1,B1:B9,C1:C9)>0)"),
            "_xlfn._xlws.FILTER(A1:A9,_xlfn.XLOOKUP(1,B1:B9,C1:C9)>0)");
        assert_eq!(to_xlsx("=\"XLOOKUP(\"&SUM(A1)"), "\"XLOOKUP(\"&SUM(A1)");
    }

    #[test]
    fn shifts_relative_references_only() {
        assert_eq!(shift("A1+$B$2+C$3+$D4", 2, 1), "B3+$B$2+D$3+$D6");
        assert_eq!(shift("SUM(A1:B2)*LOG10(A1)", 1, 0), "SUM(A2:B3)*LOG10(A2)");
        assert_eq!(shift("'My Sheet'!A1&\"A1\"", 1, 1), "'My Sheet'!B2&\"A1\"");
        assert_eq!(shift("A1", -1, 0), "#REF!");
    }
}
