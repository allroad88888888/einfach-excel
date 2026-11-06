use super::*;

fn block(sheet: &str, r1: u32, c1: u32, r2: u32, c2: u32) -> Piece {
    Piece { sheet: sheet.into(), start_row: r1, start_col: c1, end_row: r2, end_col: c2 }
}

fn names(series: &[SeriesRefs]) -> Vec<(Option<&str>, Option<&str>, &str)> {
    series.iter().map(|s| (s.name.as_deref(), s.cat.as_deref(), s.val.as_str())).collect()
}

#[test]
fn single_block_columns_with_both_headers() {
    let s = split(&[block("Data", 0, 0, 4, 2)], false, true, true).unwrap();
    assert_eq!(names(&s), [
        (Some("Data!$B$1"), Some("Data!$A$2:$A$5"), "Data!$B$2:$B$5"),
        (Some("Data!$C$1"), Some("Data!$A$2:$A$5"), "Data!$C$2:$C$5"),
    ]);
}

#[test]
fn no_headers_treats_every_cell_as_data() {
    let s = split(&[block("S", 1, 1, 3, 2)], false, false, false).unwrap();
    assert_eq!(names(&s), [(None, None, "S!$B$2:$B$4"), (None, None, "S!$C$2:$C$4")]);
}

#[test]
fn header_row_only_and_header_col_only() {
    let s = split(&[block("S", 0, 0, 2, 1)], false, true, false).unwrap();
    assert_eq!(names(&s), [(Some("S!$A$1"), None, "S!$A$2:$A$3"), (Some("S!$B$1"), None, "S!$B$2:$B$3")]);
    let s = split(&[block("S", 0, 0, 2, 1)], false, false, true).unwrap();
    assert_eq!(names(&s), [(None, Some("S!$A$1:$A$3"), "S!$B$1:$B$3")]);
}

#[test]
fn rows_mode_transposes_names_and_categories() {
    let s = split(&[block("S", 0, 0, 2, 3)], true, true, true).unwrap();
    assert_eq!(names(&s), [
        (Some("S!$A$2"), Some("S!$B$1:$D$1"), "S!$B$2:$D$2"),
        (Some("S!$A$3"), Some("S!$B$1:$D$1"), "S!$B$3:$D$3"),
    ]);
}

#[test]
fn side_by_side_blocks_keep_each_block_origin() {
    // 类别块 A1:A4 与数据块 C1:D4 同高，左右拼接。
    let s = split(&[block("S", 0, 0, 3, 0), block("S", 0, 2, 3, 3)], false, true, true).unwrap();
    assert_eq!(names(&s), [
        (Some("S!$C$1"), Some("S!$A$2:$A$4"), "S!$C$2:$C$4"),
        (Some("S!$D$1"), Some("S!$A$2:$A$4"), "S!$D$2:$D$4"),
    ]);
}

#[test]
fn stacked_blocks_use_unions_across_the_seam() {
    // 两块同宽（3 列）上下拼接：虚拟表 7 行，第 0 行表头。
    let s = split(&[block("D", 0, 1, 2, 3), block("D", 8, 1, 11, 3)], false, true, true).unwrap();
    assert_eq!(s.len(), 2);
    assert_eq!(s[0].name.as_deref(), Some("D!$C$1"));
    assert_eq!(s[0].cat.as_deref(), Some("(D!$B$2:$B$3,D!$B$9:$B$12)"));
    assert_eq!(s[0].val, "(D!$C$2:$C$3,D!$C$9:$C$12)");
}

#[test]
fn rows_mode_over_side_by_side_blocks_unions_each_row() {
    let s = split(&[block("D", 0, 0, 1, 1), block("D", 0, 5, 1, 6)], true, true, true).unwrap();
    assert_eq!(s.len(), 1);
    assert_eq!(s[0].name.as_deref(), Some("D!$A$2"));
    assert_eq!(s[0].cat.as_deref(), Some("(D!$B$1,D!$F$1:$G$1)"));
    assert_eq!(s[0].val, "(D!$B$2,D!$F$2:$G$2)");
}

#[test]
fn cross_sheet_blocks_and_mismatched_shapes() {
    let s = split(&[block("My Data", 0, 0, 2, 1)], false, true, true).unwrap();
    assert_eq!(s[0].val, "'My Data'!$B$2:$B$3");
    assert!(split(&[block("S", 0, 0, 2, 1), block("S", 0, 3, 4, 5)], false, true, true).is_none());
    assert!(split(&[block("S", 0, 0, 0, 3)], false, true, true).is_none());
    assert!(split(&[], false, true, true).is_none());
}
