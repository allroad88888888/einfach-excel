use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{
    sheet::BorderPreset, BorderSpec, BorderStyle, CellAddress, CellBorders, CellFormat, CellRange,
    CellStyle, StyleScope, Workbook,
};

fn range(a: &str) -> CellRange {
    CellRange::single(CellAddress::parse(a).unwrap())
}
fn setup() -> (Workbook, WorkbookHistory, BorderSpec) {
    let mut wb = Workbook::new();
    wb.set_cell_input(0, "B3", "neighbour").unwrap();
    wb.set_cell_input(0, "C3", "target").unwrap();
    let red = BorderSpec {
        style: BorderStyle::Thick,
        color: Some("#c00000".into()),
    };
    wb.sheet_mut(0)
        .unwrap()
        .patch_range_borders(range("C3"), BorderPreset::All, red.clone())
        .unwrap();
    (wb, WorkbookHistory::default(), red)
}

#[test]
fn clear_format_extends_existing_history_to_neighbours_without_capturing_their_content() {
    let (mut wb, mut history, red) = setup();
    history
        .begin(&wb, 0, range("C3"), "Clear all", true)
        .unwrap();
    history
        .patch_format_range(
            &mut wb,
            0,
            range("C3"),
            StyleScope::Cell,
            CellStyle::from_format(CellFormat::default()),
        )
        .unwrap();
    wb.clear_range(0, range("C3"));
    history.finish(&mut wb, true).unwrap();
    assert!(wb
        .sheet(0)
        .unwrap()
        .get_format("B3")
        .borders
        .right
        .is_none_or(|b| b.style == BorderStyle::None));
    assert_eq!(
        wb.get_cell("Sheet1", "B3"),
        einfach_core::Value::Text("neighbour".into())
    );
    assert_eq!(history.undo_count(), 1);
    history.undo(&mut wb).unwrap();
    assert_eq!(
        wb.sheet(0).unwrap().get_format("B3").borders.right,
        Some(red)
    );
    assert_eq!(
        wb.get_cell("Sheet1", "C3"),
        einfach_core::Value::Text("target".into())
    );
    history.redo(&mut wb).unwrap();
    assert_eq!(
        wb.get_cell("Sheet1", "B3"),
        einfach_core::Value::Text("neighbour".into())
    );
    assert_eq!(wb.get_cell("Sheet1", "C3"), einfach_core::Value::Null);
}

#[test]
fn unrelated_format_patch_does_not_change_borders_or_create_a_second_history_step() {
    let (mut wb, mut history, red) = setup();
    history.begin(&wb, 0, range("C3"), "Bold", false).unwrap();
    history
        .patch_format_range(
            &mut wb,
            0,
            range("C3"),
            StyleScope::Cell,
            CellStyle {
                bold: Some(true),
                ..Default::default()
            },
        )
        .unwrap();
    history.finish(&mut wb, true).unwrap();
    assert_eq!(
        wb.sheet(0).unwrap().get_format("B3").borders.right,
        Some(red)
    );
    assert_eq!(history.undo_count(), 1);
}

#[test]
fn failed_outer_transaction_rolls_back_new_neighbour_borders() {
    let (mut wb, mut history, red) = setup();
    history.begin(&wb, 0, range("C3"), "Format", false).unwrap();
    history
        .patch_format_range(
            &mut wb,
            0,
            range("C3"),
            StyleScope::Cell,
            CellStyle {
                borders: Some(CellBorders::default()),
                ..Default::default()
            },
        )
        .unwrap();
    history.finish(&mut wb, false).unwrap();
    assert_eq!(
        wb.sheet(0).unwrap().get_format("B3").borders.right,
        Some(red)
    );
    assert_eq!(history.undo_count(), 0);
}

#[test]
fn row_and_column_clear_include_existing_styles_beyond_the_display_selection() {
    for (scope, far, peer, side) in [
        (StyleScope::Row, "Z3", "Z2", BorderPreset::Top),
        (StyleScope::Column, "C90", "B90", BorderPreset::Left),
    ] {
        let (mut wb, mut history, red) = setup();
        wb.sheet_mut(0)
            .unwrap()
            .patch_range_borders(range(far), side, red.clone())
            .unwrap();
        let affected = if scope == StyleScope::Row {
            CellRange::new(CellAddress::new(2, 0), CellAddress::new(2, 16383))
        } else {
            CellRange::new(CellAddress::new(0, 2), CellAddress::new(1048575, 2))
        };
        history
            .begin(&wb, 0, affected, "Clear axis format", false)
            .unwrap();
        history
            .patch_format_range(
                &mut wb,
                0,
                range("C3"),
                scope,
                CellStyle::from_format(CellFormat::default()),
            )
            .unwrap();
        history.finish(&mut wb, true).unwrap();
        let border = |wb: &Workbook| {
            let edges = wb.sheet(0).unwrap().get_format(peer).borders;
            if scope == StyleScope::Row {
                edges.bottom
            } else {
                edges.right
            }
        };
        assert!(border(&wb).is_none_or(|b| b.style == BorderStyle::None));
        history.undo(&mut wb).unwrap();
        assert_eq!(border(&wb), Some(red));
    }
}
