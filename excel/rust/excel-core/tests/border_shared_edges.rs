use einfach_excel_core::{
    sheet::BorderPreset, BorderSpec, BorderStyle, CellAddress, CellRange, Sheet,
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
fn later_pen_replaces_both_faces_without_changing_other_edges() {
    let mut sheet = Sheet::new();
    let red = pen(BorderStyle::Thick, "#c00000");
    let blue = pen(BorderStyle::Thin, "#123abc");
    sheet
        .patch_range_borders(range("B2", "C3"), BorderPreset::All, red.clone())
        .unwrap();
    sheet
        .patch_range_borders(range("C2", "C2"), BorderPreset::Left, blue.clone())
        .unwrap();
    assert_eq!(sheet.get_format("B2").borders.right, Some(blue.clone()));
    assert_eq!(sheet.get_format("C2").borders.left, Some(blue));
    assert_eq!(sheet.get_format("B2").borders.bottom, Some(red));
}

#[test]
fn clear_one_cell_erases_the_shared_edges_on_all_four_neighbours() {
    let mut sheet = Sheet::new();
    let red = pen(BorderStyle::Thin, "#c00000");
    sheet
        .patch_range_borders(range("B2", "D4"), BorderPreset::All, red.clone())
        .unwrap();
    sheet
        .patch_range_borders(range("C3", "C3"), BorderPreset::None, red.clone())
        .unwrap();
    for border in [
        sheet.get_format("B3").borders.right,
        sheet.get_format("D3").borders.left,
        sheet.get_format("C2").borders.bottom,
        sheet.get_format("C4").borders.top,
    ] {
        assert!(border.is_none_or(|border| border.style == BorderStyle::None));
    }
    assert_eq!(sheet.get_format("B2").borders.top, Some(red));
}
