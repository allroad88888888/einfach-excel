//! A1 地址与零基行列互转。

pub fn column_name(mut col: u32) -> String {
    let mut name = Vec::new();
    loop {
        name.push(b'A' + (col % 26) as u8);
        if col < 26 {
            break;
        }
        col = col / 26 - 1;
    }
    name.reverse();
    String::from_utf8(name).expect("ASCII column name")
}

pub fn cell_name(row: u32, col: u32) -> String {
    format!("{}{}", column_name(col), row + 1)
}

/// `"B12"` → `(11, 1)`；只接受无 `$` 的普通地址。
pub fn parse_cell(name: &str) -> Option<(u32, u32)> {
    let split = name.find(|c: char| c.is_ascii_digit())?;
    let (letters, digits) = name.split_at(split);
    let col = parse_column(letters)?;
    let row: u32 = digits.parse().ok()?;
    (row >= 1).then(|| (row - 1, col))
}

pub fn parse_column(letters: &str) -> Option<u32> {
    if letters.is_empty() || letters.len() > 3 {
        return None;
    }
    let mut col: u32 = 0;
    for byte in letters.bytes() {
        let upper = byte.to_ascii_uppercase();
        if !upper.is_ascii_uppercase() {
            return None;
        }
        col = col * 26 + u32::from(upper - b'A' + 1);
    }
    Some(col - 1)
}

/// `"A1:C3"` 或单格 `"B2"` → `[startRow, startCol, endRow, endCol]`
pub fn parse_range(text: &str) -> Option<[u32; 4]> {
    let (start, end) = text.split_once(':').unwrap_or((text, text));
    let (r1, c1) = parse_cell(start)?;
    let (r2, c2) = parse_cell(end)?;
    Some([r1.min(r2), c1.min(c2), r1.max(r2), c1.max(c2)])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_column_names() {
        for (col, name) in [(0, "A"), (25, "Z"), (26, "AA"), (701, "ZZ"), (702, "AAA"), (16_383, "XFD")] {
            assert_eq!(column_name(col), name);
            assert_eq!(parse_column(name), Some(col));
        }
        assert_eq!(parse_cell("C7"), Some((6, 2)));
        assert_eq!(parse_range("B2:A1"), Some([0, 0, 1, 1]));
        assert_eq!(parse_cell("A0"), None);
    }
}
