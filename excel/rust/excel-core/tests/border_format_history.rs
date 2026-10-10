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

#[test]
fn axis_clear_reconciles_inherited_edges_without_expanding_the_whole_axis() {
    for scope in [StyleScope::Row, StyleScope::Column] {
        let (mut wb, mut history, red) = setup();
        let (far, peer, opposite_scope) = if scope == StyleScope::Row {
            ("Z3", "Z2", StyleScope::Column)
        } else {
            ("C900000", "B900000", StyleScope::Row)
        };
        let inherited = CellBorders {
            top: Some(red.clone()),
            bottom: Some(red.clone()),
            left: Some(red.clone()),
            right: Some(red.clone()),
        };
        let sheet = wb.sheet_mut(0).unwrap();
        sheet.patch_format_range(
            range(far),
            opposite_scope,
            CellStyle {
                borders: Some(inherited.clone()),
                ..Default::default()
            },
        );
        // 相邻轴本身也有边框，不能只修补有限展示矩形里的单元格。
        sheet.patch_format_range(
            range(peer),
            scope,
            CellStyle {
                borders: Some(inherited.clone()),
                bold: Some(true),
                ..Default::default()
            },
        );
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
        for address in [
            peer,
            if scope == StyleScope::Row {
                "Y2"
            } else {
                "B800000"
            },
        ] {
            let format = wb.sheet(0).unwrap().get_format(address);
            let edge = if scope == StyleScope::Row {
                format.borders.bottom
            } else {
                format.borders.right
            };
            assert!(
                edge.is_none_or(|b| b.style == BorderStyle::None),
                "{scope:?} {address}"
            );
            assert!(format.bold);
            assert_eq!(format.borders.top, Some(red.clone()));
        }
        let snapshot = wb.sheet(0).unwrap().snapshot_format_range(CellRange::new(
            CellAddress::new(0, 0),
            CellAddress::new(1048575, 16383),
        ));
        assert!(snapshot.cell_styles.len() < 100, "must remain sparse");
        history.undo(&mut wb).unwrap();
        assert_eq!(wb.sheet(0).unwrap().get_format(peer).borders, inherited);
        history.redo(&mut wb).unwrap();
        let edges = wb.sheet(0).unwrap().get_format(peer).borders;
        assert!(if scope == StyleScope::Row {
            edges.bottom
        } else {
            edges.right
        }
        .is_none_or(|b| b.style == BorderStyle::None));
    }
}

#[test]
fn axis_clear_includes_neighbour_only_styles_and_rolls_back_both_sides() {
    for (scope, peer, side) in [
        (StyleScope::Row, "Z4", "top"),
        (StyleScope::Column, "D900000", "left"),
    ] {
        let (mut wb, mut history, red) = setup();
        // 导入的旧格式可能只存邻格这一面，目标行列自身没有对应 cellStyle。
        let mut edges = CellBorders::default();
        if side == "top" {
            edges.top = Some(red.clone());
        } else {
            edges.left = Some(red.clone());
        }
        wb.sheet_mut(0).unwrap().set_format(
            peer,
            CellFormat {
                borders: edges.clone(),
                italic: true,
                ..Default::default()
            },
        );
        history.begin(&wb, 0, range("C3"), "Clear", false).unwrap();
        history
            .patch_format_range(
                &mut wb,
                0,
                range("C3"),
                scope,
                CellStyle::from_format(CellFormat::default()),
            )
            .unwrap();
        let format = wb.sheet(0).unwrap().get_format(peer);
        assert!(format.italic);
        assert!(if side == "top" {
            format.borders.top
        } else {
            format.borders.left
        }
        .is_none_or(|b| b.style == BorderStyle::None));
        history.finish(&mut wb, false).unwrap();
        assert_eq!(wb.sheet(0).unwrap().get_format(peer).borders, edges);
        assert_eq!(history.undo_count(), 0);
    }
}
