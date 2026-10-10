use einfach_excel_core::{
    sheet::BorderPreset, BorderSpec, BorderStyle, CellAddress, CellBorders, CellRange, CellStyle,
    Sheet, StyleScope,
};

fn range(a: &str, b: &str) -> CellRange {
    CellRange::new(
        CellAddress::parse(a).unwrap(),
        CellAddress::parse(b).unwrap(),
    )
}
fn pen(style: BorderStyle, color: &str) -> BorderSpec {
    BorderSpec {
        style,
        color: Some(color.into()),
    }
}

#[test]
fn changing_first_segment_does_not_recolor_missing_segments_of_an_imported_merge() {
    for (neighbour, preset, vertical) in [
        ("B1", BorderPreset::Bottom, false),
        ("A2", BorderPreset::Right, true),
    ] {
        let mut sheet = Sheet::new();
        sheet
            .restore_merged_ranges(vec![range("B2", "D4")])
            .unwrap();
        let red = pen(BorderStyle::Thick, "#c00000");
        sheet.patch_format_range(
            range("B2", "B2"),
            StyleScope::Cell,
            CellStyle {
                borders: Some(CellBorders {
                    top: Some(red.clone()),
                    left: Some(red.clone()),
                    ..Default::default()
                }),
                ..Default::default()
            },
        );
        let blue = pen(BorderStyle::Thin, "#123abc");
        sheet
            .patch_range_borders(range(neighbour, neighbour), preset, blue.clone())
            .unwrap();
        let borders = sheet.get_format("B2").borders;
        assert_eq!(
            if vertical { borders.left } else { borders.top },
            Some(blue)
        );
        for addr in if vertical { ["B3", "B4"] } else { ["C2", "D2"] } {
            let borders = sheet.get_format(addr).borders;
            assert_eq!(
                if vertical { borders.left } else { borders.top },
                Some(red.clone()),
                "{addr}"
            );
        }
    }
}

#[test]
fn clearing_a_covered_segment_overrides_the_anchor_border_without_changing_the_rest() {
    let mut sheet = Sheet::new();
    sheet
        .restore_merged_ranges(vec![range("B2", "D4")])
        .unwrap();
    let red = pen(BorderStyle::Thick, "#c00000");
    sheet.patch_format_range(
        range("B2", "B2"),
        StyleScope::Cell,
        CellStyle {
            borders: Some(CellBorders {
                right: Some(red.clone()),
                ..Default::default()
            }),
            ..Default::default()
        },
    );
    sheet
        .patch_range_borders(range("E3", "E3"), BorderPreset::None, red.clone())
        .unwrap();
    assert_eq!(
        sheet.get_format("D3").borders.right,
        Some(BorderSpec::default())
    );
    assert_eq!(sheet.get_format("B2").borders.right, Some(red));
}

#[test]
fn changing_first_segment_of_blank_merge_keeps_remaining_segments_blank() {
    let mut sheet = Sheet::new();
    sheet
        .restore_merged_ranges(vec![range("B2", "D4")])
        .unwrap();
    sheet
        .patch_range_borders(
            range("B1", "B1"),
            BorderPreset::Bottom,
            pen(BorderStyle::Thin, "#123abc"),
        )
        .unwrap();
    for addr in ["C2", "D2"] {
        assert_eq!(
            sheet.get_format(addr).borders.top,
            Some(BorderSpec::default())
        );
    }
}

#[test]
fn single_axis_merge_keeps_other_segments_when_its_anchor_bottom_or_right_changes() {
    for (end, neighbour, preset, horizontal) in [
        ("D2", "B3", BorderPreset::Top, true),
        ("B4", "C2", BorderPreset::Left, false),
    ] {
        let mut sheet = Sheet::new();
        sheet.restore_merged_ranges(vec![range("B2", end)]).unwrap();
        let red = pen(BorderStyle::Thick, "#c00000");
        let mut borders = CellBorders::default();
        if horizontal {
            borders.bottom = Some(red.clone());
        } else {
            borders.right = Some(red.clone());
        }
        sheet.patch_format_range(
            range("B2", "B2"),
            StyleScope::Cell,
            CellStyle {
                borders: Some(borders),
                ..Default::default()
            },
        );
        sheet
            .patch_range_borders(
                range(neighbour, neighbour),
                preset,
                pen(BorderStyle::Thin, "#123abc"),
            )
            .unwrap();
        let edge = sheet.get_format(end).borders;
        assert_eq!(if horizontal { edge.bottom } else { edge.right }, Some(red));
    }
}
