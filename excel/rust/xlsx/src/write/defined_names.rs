//! 原生命名区域 → workbook.xml 的 `<definedNames>`。

use super::xml::escape;
use crate::address::column_name;
use crate::native::{NamedRange, MAX_COLS, MAX_ROWS};

fn area([r1, c1, r2, c2]: [u32; 4]) -> String {
    if r1 == 0 && r2 == MAX_ROWS - 1 {
        return format!("${}:${}", column_name(c1), column_name(c2));
    }
    if c1 == 0 && c2 == MAX_COLS - 1 {
        return format!("${}:${}", r1 + 1, r2 + 1);
    }
    let absolute = |row: u32, col: u32| format!("${}${}", column_name(col), row + 1);
    if (r1, c1) == (r2, c2) {
        absolute(r1, c1)
    } else {
        format!("{}:{}", absolute(r1, c1), absolute(r2, c2))
    }
}

pub fn xml(names: &[NamedRange], sheets: &[String]) -> (String, usize) {
    let mut broken = 0usize;
    let items: String = names.iter().map(|named| {
        let target = if let Some(formula) = &named.formula {
            let body = crate::formula::to_xlsx(formula);
            if body.is_empty() || body.contains("#REF!") {
                broken += 1;
                "#REF!".into()
            } else {
                body
            }
        } else {
            named.target.as_ref()
                .and_then(|t| sheets.get(t.sheet).map(|sheet| format!("'{}'!{}", sheet.replace('\'', "''"), area(t.range))))
                .unwrap_or_else(|| {
                    broken += 1;
                    "#REF!".into()
                })
        };
        let scope_attr = match named.scope {
            Some(scope) if scope < sheets.len() => format!(r#" localSheetId="{scope}""#),
            _ => String::new(),
        };
        format!(r#"<definedName name="{}"{scope_attr}>{}</definedName>"#, escape(&named.name), escape(&target))
    }).collect();
    if items.is_empty() {
        (String::new(), broken)
    } else {
        (format!("<definedNames>{items}</definedNames>"), broken)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_cells_columns_and_rows() {
        assert_eq!(area([1, 0, 4, 0]), "$A$2:$A$5");
        assert_eq!(area([0, 1, MAX_ROWS - 1, 2]), "$B:$C");
        assert_eq!(area([2, 0, 3, MAX_COLS - 1]), "$3:$4");
        assert_eq!(area([0, 0, 0, 0]), "$A$1");
    }
}
