//! 图表系列公式：带表名的 A1 绝对引用，以及同一条数据跨块时的并集 `(A!$B$2:$B$5,A!$B$9:$B$12)`。

use crate::address::column_name;

/// 一块带表名的矩形（零基、含两端）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Piece {
    pub sheet: String,
    pub start_row: u32,
    pub start_col: u32,
    pub end_row: u32,
    pub end_col: u32,
}

/// 表名不是纯字母数字下划线（或以数字开头）时加单引号，内部 `'` 写成 `''`。
pub fn sheet_ref(name: &str) -> String {
    let plain = !name.is_empty()
        && name.chars().all(|c| c.is_alphanumeric() || c == '_')
        && !name.starts_with(|c: char| c.is_ascii_digit());
    if plain { name.to_string() } else { format!("'{}'", name.replace('\'', "''")) }
}

fn absolute(piece: &Piece) -> String {
    let corner = |row: u32, col: u32| format!("${}${}", column_name(col), row + 1);
    let sheet = sheet_ref(&piece.sheet);
    if piece.start_row == piece.end_row && piece.start_col == piece.end_col {
        format!("{sheet}!{}", corner(piece.start_row, piece.start_col))
    } else {
        format!("{sheet}!{}:{}", corner(piece.start_row, piece.start_col), corner(piece.end_row, piece.end_col))
    }
}

/// 一块 → 单个引用；多块 → 并集。空列表返回 None。
pub fn formula(pieces: &[Piece]) -> Option<String> {
    match pieces {
        [] => None,
        [one] => Some(absolute(one)),
        many => Some(format!("({})", many.iter().map(absolute).collect::<Vec<_>>().join(","))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn piece(sheet: &str, r1: u32, c1: u32, r2: u32, c2: u32) -> Piece {
        Piece { sheet: sheet.into(), start_row: r1, start_col: c1, end_row: r2, end_col: c2 }
    }

    #[test]
    fn quotes_names_that_need_it() {
        assert_eq!(sheet_ref("Data_1"), "Data_1");
        assert_eq!(sheet_ref("My Data"), "'My Data'");
        assert_eq!(sheet_ref("O'Brien"), "'O''Brien'");
        assert_eq!(sheet_ref("2024"), "'2024'");
    }

    #[test]
    fn single_cell_range_and_union() {
        assert_eq!(formula(&[piece("A", 0, 0, 0, 0)]).unwrap(), "A!$A$1");
        assert_eq!(formula(&[piece("A b", 1, 1, 4, 1)]).unwrap(), "'A b'!$B$2:$B$5");
        assert_eq!(formula(&[piece("D", 1, 1, 4, 1), piece("D", 8, 1, 11, 1)]).unwrap(), "(D!$B$2:$B$5,D!$B$9:$B$12)");
        assert_eq!(formula(&[]), None);
    }
}
