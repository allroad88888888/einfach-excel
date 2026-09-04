//! cellStyle、rowStyle、columnStyle 的解析与写入规则。

use super::super::*;
use crate::cell_style::{CellStyle, StyleScope};
use crate::format::{Align, NumberFormat};

fn range(start: CellAddress, end: CellAddress) -> CellRange {
    CellRange::new(start, end)
}

#[test]
fn complete_cell_format_roundtrips() {
    let mut sheet = Sheet::new();
    let format = CellFormat {
        number_format: NumberFormat::Percent { digits: 0 },
        bold: true,
        align: Align::Center,
        ..Default::default()
    };
    sheet.set_format("A1", format.clone());
    assert_eq!(sheet.get_format("A1"), format);

    sheet.set_format("A1", CellFormat::default());
    assert_eq!(sheet.get_format("A1"), CellFormat::default());
}

#[test]
fn cell_patch_changes_only_the_requested_property() {
    let mut sheet = Sheet::new();
    sheet.patch_format_range(
        range(CellAddress::new(0, 0), CellAddress::new(0, 0)),
        StyleScope::Cell,
        CellStyle {
            bold: Some(true),
            ..Default::default()
        },
    );
    sheet.patch_format_range(
        range(CellAddress::new(0, 0), CellAddress::new(0, 0)),
        StyleScope::Cell,
        CellStyle {
            italic: Some(true),
            ..Default::default()
        },
    );
    assert_eq!(
        sheet.get_format("A1"),
        CellFormat {
            bold: true,
            italic: true,
            ..Default::default()
        }
    );
}

#[test]
fn large_cell_font_grows_only_its_row_style() {
    let mut sheet = Sheet::new();
    sheet.patch_format_range(
        range(CellAddress::new(2, 3), CellAddress::new(2, 3)),
        StyleScope::Cell,
        CellStyle {
            font_size: Some(Some(36)),
            ..Default::default()
        },
    );

    assert_eq!(sheet.row_height(2), Some(51));
    assert_eq!(sheet.row_height(1), None);
    assert_eq!(sheet.row_height(3), None);
    assert_eq!(sheet.all_row_heights(), vec![(2, 51)]);
}

#[test]
fn later_column_action_wins_at_row_intersection() {
    let mut sheet = Sheet::new();
    sheet.patch_format_range(
        range(CellAddress::new(1, 0), CellAddress::new(1, 0)),
        StyleScope::Row,
        CellStyle {
            color: Some(Some("black".into())),
            ..Default::default()
        },
    );
    sheet.patch_format_range(
        range(CellAddress::new(0, 2), CellAddress::new(0, 2)),
        StyleScope::Column,
        CellStyle {
            color: Some(Some("red".into())),
            ..Default::default()
        },
    );

    assert_eq!(sheet.get_format("C2").color.as_deref(), Some("red"));
    assert_eq!(sheet.get_format("B2").color.as_deref(), Some("black"));
    assert_eq!(sheet.get_format("C3").color.as_deref(), Some("red"));
}

#[test]
fn later_row_action_wins_at_column_intersection() {
    let mut sheet = Sheet::new();
    sheet.patch_format_range(
        range(CellAddress::new(0, 2), CellAddress::new(0, 2)),
        StyleScope::Column,
        CellStyle {
            background: Some(Some("red".into())),
            ..Default::default()
        },
    );
    sheet.patch_format_range(
        range(CellAddress::new(1, 0), CellAddress::new(1, 0)),
        StyleScope::Row,
        CellStyle {
            background: Some(Some("black".into())),
            ..Default::default()
        },
    );

    assert_eq!(sheet.get_format("C2").background.as_deref(), Some("black"));
}

#[test]
fn row_and_column_conflicts_are_resolved_per_property() {
    let mut sheet = Sheet::new();
    sheet.patch_format_range(
        range(CellAddress::new(1, 0), CellAddress::new(1, 0)),
        StyleScope::Row,
        CellStyle {
            bold: Some(true),
            ..Default::default()
        },
    );
    sheet.patch_format_range(
        range(CellAddress::new(0, 2), CellAddress::new(0, 2)),
        StyleScope::Column,
        CellStyle {
            color: Some(Some("red".into())),
            ..Default::default()
        },
    );

    let format = sheet.get_format("C2");
    assert!(format.bold);
    assert_eq!(format.color.as_deref(), Some("red"));
}

#[test]
fn explicit_color_clear_blocks_inherited_color() {
    let mut sheet = Sheet::new();
    sheet.patch_format_range(
        range(CellAddress::new(1, 0), CellAddress::new(1, 0)),
        StyleScope::Row,
        CellStyle {
            color: Some(Some("red".into())),
            ..Default::default()
        },
    );
    sheet.patch_format_range(
        range(CellAddress::new(1, 2), CellAddress::new(1, 2)),
        StyleScope::Cell,
        CellStyle {
            color: Some(None),
            ..Default::default()
        },
    );
    assert_eq!(sheet.get_format("C2").color, None);
}

#[test]
fn snapshot_restores_all_three_sparse_layers() {
    let mut sheet = Sheet::new();
    let target = range(CellAddress::new(0, 0), CellAddress::new(2, 2));
    sheet.patch_format_range(
        target,
        StyleScope::Row,
        CellStyle {
            italic: Some(true),
            ..Default::default()
        },
    );
    let snapshot = sheet.snapshot_format_range(target);
    sheet.patch_format_range(
        target,
        StyleScope::Column,
        CellStyle {
            bold: Some(true),
            ..Default::default()
        },
    );

    sheet.restore_format_range_snapshot(snapshot);
    assert!(sheet.get_format("A1").italic);
    assert!(!sheet.get_format("A1").bold);
}

#[test]
fn format_write_notifies_only_affected_subscribers() {
    use std::cell::Cell;
    use std::rc::Rc;

    let mut sheet = Sheet::new();
    let count = Rc::new(Cell::new(0));
    let observed = Rc::clone(&count);
    let _subscription = sheet.subscribe_cell("A1", move || observed.set(observed.get() + 1));
    let notified = sheet.patch_format_range(
        range(CellAddress::new(0, 0), CellAddress::new(0, 0)),
        StyleScope::Row,
        CellStyle {
            bold: Some(true),
            ..Default::default()
        },
    );
    assert_eq!(notified, 1);
    assert_eq!(count.get(), 1);
}

#[test]
fn row_and_column_styles_follow_structural_axis_edits() {
    let mut sheet = Sheet::new();
    sheet.patch_format_range(
        range(CellAddress::new(1, 0), CellAddress::new(1, 0)),
        StyleScope::Row,
        CellStyle {
            bold: Some(true),
            ..Default::default()
        },
    );
    sheet.patch_format_range(
        range(CellAddress::new(0, 1), CellAddress::new(0, 1)),
        StyleScope::Column,
        CellStyle {
            italic: Some(true),
            ..Default::default()
        },
    );

    sheet.insert_row(0, 1);
    sheet.insert_col(0, 1);

    assert!(sheet.get_format("A3").bold);
    assert!(sheet.get_format("C1").italic);
    assert_eq!(sheet.get_format("A2"), CellFormat::default());
    assert_eq!(sheet.get_format("B1"), CellFormat::default());
}
