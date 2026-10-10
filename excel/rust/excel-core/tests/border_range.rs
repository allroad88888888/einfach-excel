use einfach_excel_core::{
    sheet::BorderPreset, BorderSpec, BorderStyle, CellAddress, CellBorders, CellFormat, CellRange,
    CellStyle, Sheet, StyleScope,
};

fn area() -> CellRange {
    CellRange::new(CellAddress::new(1, 1), CellAddress::new(3, 3))
}
fn red() -> BorderSpec {
    BorderSpec {
        style: BorderStyle::Thin,
        color: Some("#c00000".into()),
    }
}
fn sides(borders: CellBorders) -> [bool; 4] {
    [borders.top, borders.right, borders.bottom, borders.left]
        .map(|value| value.is_some_and(|border| border.style != BorderStyle::None))
}

#[test]
fn all_positions_follow_selection_edges_including_reversed_ranges() {
    use BorderPreset::*;
    for preset in [
        All, Outside, Inside, Horizontal, Vertical, Top, Right, Bottom, Left, None,
    ] {
        let mut sheet = Sheet::new();
        sheet
            .patch_range_borders(CellRange::new(area().end, area().start), preset, red())
            .unwrap();
        for row in 1..=3 {
            for col in 1..=3 {
                let outer = [row == 1, col == 3, row == 3, col == 1];
                let expected = match preset {
                    All => [true; 4],
                    Outside => outer,
                    Inside => outer.map(|x| !x),
                    Horizontal => [!outer[0], false, !outer[2], false],
                    Vertical => [false, !outer[1], false, !outer[3]],
                    Top => [outer[0], false, false, false],
                    Right => [false, outer[1], false, false],
                    Bottom => [false, false, outer[2], false],
                    Left => [false, false, false, outer[3]],
                    None => [false; 4],
                };
                let addr = CellAddress::new(row, col).to_string_repr();
                assert_eq!(
                    sides(sheet.get_format(&addr).borders),
                    expected,
                    "{preset:?} {addr}"
                );
            }
        }
        assert_eq!(sheet.get_format("A1"), CellFormat::default());
        assert_eq!(sheet.get_format("E5"), CellFormat::default());
    }
}

#[test]
fn selective_edges_preserve_other_sides_and_formats() {
    let mut sheet = Sheet::new();
    sheet.patch_format_range(
        area(),
        StyleScope::Row,
        CellStyle {
            bold: Some(true),
            ..Default::default()
        },
    );
    sheet
        .patch_range_borders(area(), BorderPreset::All, red())
        .unwrap();
    let before = sheet.get_format("B2");
    for style in [
        BorderStyle::Thin,
        BorderStyle::Medium,
        BorderStyle::Thick,
        BorderStyle::Dashed,
        BorderStyle::Dotted,
        BorderStyle::Double,
    ] {
        let border = BorderSpec {
            style,
            color: Some("#123abc".into()),
        };
        sheet
            .patch_range_borders(area(), BorderPreset::Top, border.clone())
            .unwrap();
        let after = sheet.get_format("B2");
        assert!(after.bold);
        assert_eq!(after.borders.top, Some(border));
        assert_eq!(after.borders.right, before.borders.right);
        assert_eq!(after.borders.bottom, before.borders.bottom);
        assert_eq!(after.borders.left, before.borders.left);
        assert_eq!(sheet.get_format("C3").borders.top, Some(red()));
    }
}

#[test]
fn clear_blocks_inherited_borders_without_touching_outside_or_other_styles() {
    let mut sheet = Sheet::new();
    sheet.patch_format_range(
        area(),
        StyleScope::Row,
        CellStyle {
            italic: Some(true),
            borders: Some(CellBorders {
                top: Some(red()),
                ..Default::default()
            }),
            ..Default::default()
        },
    );
    sheet
        .patch_range_borders(area(), BorderPreset::None, red())
        .unwrap();
    assert_eq!(sides(sheet.get_format("B2").borders), [false; 4]);
    assert!(sheet.get_format("B2").italic);
    assert_eq!(sheet.get_format("A2").borders.top, Some(red()));
    // 后写的行样式仍能覆盖当前 cellStyle，没有额外优先级或时间戳。
    sheet.patch_format_range(
        area(),
        StyleScope::Row,
        CellStyle {
            borders: Some(CellBorders {
                bottom: Some(red()),
                ..Default::default()
            }),
            ..Default::default()
        },
    );
    assert_eq!(sheet.get_format("B2").borders.bottom, Some(red()));
}

#[test]
fn single_cell_has_no_inside_edges_and_all_four_outside_edges() {
    let mut sheet = Sheet::new();
    let one = CellRange::new(CellAddress::new(0, 0), CellAddress::new(0, 0));
    for preset in [
        BorderPreset::Inside,
        BorderPreset::Horizontal,
        BorderPreset::Vertical,
    ] {
        sheet.patch_range_borders(one, preset, red()).unwrap();
        assert_eq!(sheet.get_format("A1"), CellFormat::default());
    }
    sheet
        .patch_range_borders(one, BorderPreset::Outside, red())
        .unwrap();
    assert_eq!(sides(sheet.get_format("A1").borders), [true; 4]);
    let snapshot = sheet.snapshot_format_range(one);
    sheet
        .patch_range_borders(one, BorderPreset::None, red())
        .unwrap();
    sheet.restore_format_range_snapshot(snapshot);
    assert_eq!(sides(sheet.get_format("A1").borders), [true; 4]);
}

#[test]
fn merged_anchor_uses_full_geometry_and_partial_merge_rejects_before_writing() {
    let mut sheet = Sheet::new();
    sheet.restore_merged_ranges(vec![area()]).unwrap();
    sheet
        .patch_range_borders(area(), BorderPreset::Outside, red())
        .unwrap();
    assert_eq!(sides(sheet.get_format("B2").borders), [true; 4]);
    sheet
        .patch_range_borders(area(), BorderPreset::None, red())
        .unwrap();
    sheet
        .patch_range_borders(area(), BorderPreset::Inside, red())
        .unwrap();
    assert_eq!(sides(sheet.get_format("B2").borders), [false; 4]);
    let partial = CellRange::new(CellAddress::new(0, 0), CellAddress::new(1, 1));
    assert!(sheet
        .patch_range_borders(partial, BorderPreset::All, red())
        .is_err());
    assert_eq!(sheet.get_format("A1"), CellFormat::default());
}
