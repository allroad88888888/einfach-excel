//! 字号写入只在本次范围内更新 rowStyle 高度；缩小字号不隐式缩行。
use super::super::*;
use crate::cell_style::{CellStyle, StyleScope};

fn target() -> CellRange {
    CellRange::new(CellAddress::new(2, 1), CellAddress::new(3, 2))
}

fn font(size: Option<u32>) -> CellStyle {
    CellStyle {
        font_size: Some(size),
        ..Default::default()
    }
}

#[test]
fn row_and_column_fonts_grow_only_rows_in_the_explicit_range() {
    for scope in [StyleScope::Cell, StyleScope::Row, StyleScope::Column] {
        let mut sheet = Sheet::new();
        sheet.patch_format_range(target(), scope, font(Some(37)));
        assert_eq!(sheet.all_row_heights(), vec![(2, 52), (3, 52)]);
        assert_eq!(sheet.get_format("B3").font_size, Some(37));
        assert_eq!(sheet.row_height(1), None);
        assert_eq!(sheet.row_height(4), None);
        assert!(sheet.all_col_widths().is_empty());
    }
}

#[test]
fn smaller_or_cleared_fonts_do_not_shrink_existing_row_heights() {
    for scope in [StyleScope::Cell, StyleScope::Row, StyleScope::Column] {
        let mut sheet = Sheet::new();
        sheet.patch_format_range(target(), scope, font(Some(37)));
        sheet.patch_format_range(target(), scope, font(Some(12)));
        assert_eq!(sheet.get_format("B3").font_size, Some(12));
        assert_eq!(sheet.all_row_heights(), vec![(2, 52), (3, 52)]);
        sheet.patch_format_range(target(), scope, font(None));
        assert_eq!(sheet.get_format("B3").font_size, None);
        assert_eq!(sheet.all_row_heights(), vec![(2, 52), (3, 52)]);
    }
}

#[test]
fn scoped_font_snapshot_restores_both_size_and_row_heights() {
    for scope in [StyleScope::Row, StyleScope::Column] {
        let mut sheet = Sheet::new();
        let before = sheet.snapshot_format_range(target());
        sheet.patch_format_range(target(), scope, font(Some(37)));
        sheet.restore_format_range_snapshot(before);
        assert_eq!(sheet.get_format("B3").font_size, None);
        assert!(sheet.all_row_heights().is_empty());
    }
}
