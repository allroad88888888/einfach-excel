use einfach_excel_core::{sheet::BorderPreset, BorderSpec, BorderStyle, CellAddress,
    CellBorders, CellFormat, CellRange, CellStyle, Sheet, StyleScope, Workbook};
use einfach_excel_core::protection::ProtectionChange;
use einfach_excel_core::workbook_history::WorkbookHistory;

fn area() -> CellRange { CellRange::new(CellAddress::new(1, 1), CellAddress::new(2, 2)) }
fn pen() -> BorderSpec { BorderSpec { style: BorderStyle::Double, color: Some("#c00000".into()) } }
fn visible(spec: &Option<BorderSpec>) -> bool {
    spec.as_ref().is_some_and(|spec| spec.style != BorderStyle::None)
}

#[test]
fn direction_presets_replace_only_diagonals_per_cell_without_touching_neighbours() {
    for (preset, up, down) in [(BorderPreset::DiagonalDown, false, true),
        (BorderPreset::DiagonalUp, true, false), (BorderPreset::Diagonal, true, true),
        (BorderPreset::DiagonalNone, false, false)] {
        let mut sheet = Sheet::new();
        sheet.patch_range_borders(area(), BorderPreset::All, pen()).unwrap();
        sheet.patch_range_borders(area(), BorderPreset::Diagonal, pen()).unwrap();
        let neighbour = sheet.get_format("A2");
        sheet.patch_range_borders(area(), preset, pen()).unwrap();
        for addr in area().iter() {
            let borders = sheet.get_format(&addr.to_string_repr()).borders;
            assert_eq!((visible(&borders.diag_up), visible(&borders.diag_down)), (up, down));
            for side in [borders.top, borders.right, borders.bottom, borders.left] {
                assert_eq!(side, Some(pen()));
            }
        }
        assert_eq!(sheet.get_format("A2"), neighbour);
        assert_eq!(sheet.get_format("D4"), CellFormat::default());
    }
}

#[test]
fn merged_diagonal_targets_only_the_anchor_and_partial_merge_rejects_atomically() {
    let mut sheet = Sheet::new();
    sheet.restore_merged_ranges(vec![area()]).unwrap();
    sheet.patch_range_borders(area(), BorderPreset::Diagonal, pen()).unwrap();
    assert_eq!(sheet.get_format("B2").borders.diag_down, Some(pen()));
    let snapshot = sheet.snapshot_format_range(area());
    assert_eq!(snapshot.cell_styles.len(), 1);
    assert!(sheet.patch_range_borders(CellRange::single(area().start),
        BorderPreset::DiagonalNone, pen()).is_err());
    assert_eq!(sheet.snapshot_format_range(area()).cell_styles, snapshot.cell_styles);
}

#[test]
fn physical_presets_preserve_diagonals_and_no_borders_clears_inherited_diagonals() {
    let mut sheet = Sheet::new();
    sheet.patch_format_range(area(), StyleScope::Row, CellStyle { bold: Some(true),
        borders: Some(CellBorders { diag_up: Some(pen()), ..Default::default() }), ..Default::default() });
    sheet.patch_range_borders(area(), BorderPreset::Outside, pen()).unwrap();
    assert_eq!(sheet.get_format("B2").borders.diag_up, Some(pen()));
    sheet.patch_range_borders(area(), BorderPreset::None, pen()).unwrap();
    let target = sheet.get_format("B2");
    assert!(target.bold);
    assert!(!visible(&target.borders.diag_up));
    assert!(!visible(&target.borders.top));
    assert_eq!(sheet.get_format("A2").borders.diag_up, Some(pen()));
}

#[test]
fn protected_neighbours_do_not_block_diagonals_and_history_is_atomic_and_idempotent() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    book.change_protection(0, ProtectionChange::AllowRange { range: area().into() }).unwrap();
    book.change_protection(0, ProtectionChange::Protect).unwrap();
    history.patch_range_borders(&mut book, 0, area(), BorderPreset::Diagonal, pen()).unwrap();
    assert_eq!(history.undo_count(), 1);
    history.patch_range_borders(&mut book, 0, area(), BorderPreset::Diagonal, pen()).unwrap();
    assert_eq!(history.undo_count(), 1);
    let invalid = CellRange::new(area().start, CellAddress::new(3, 2));
    assert!(history.patch_range_borders(&mut book, 0, invalid, BorderPreset::DiagonalUp, pen()).is_err());
    assert_eq!(history.undo_count(), 1);
    assert_eq!(book.sheet(0).unwrap().get_format("B2").borders.diag_up, Some(pen()));
    history.undo(&mut book).unwrap();
    assert_eq!(book.sheet(0).unwrap().get_format("B2").borders, CellBorders::default());
    history.redo(&mut book).unwrap();
    assert_eq!(book.sheet(0).unwrap().get_format("C3").borders.diag_down, Some(pen()));
    assert_eq!(book.sheet(0).unwrap().get_format("A2").borders, CellBorders::default());
}
