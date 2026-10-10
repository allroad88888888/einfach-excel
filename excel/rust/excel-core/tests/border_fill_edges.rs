use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{
    sheet::BorderPreset, AutoFillDirection, AutoFillRequest, AutoFillSeries, BorderSpec,
    BorderStyle, CellAddress, CellBorders, CellFormat, CellRange, Workbook,
};

fn range(start: &str, end: &str) -> CellRange {
    CellRange::new(
        CellAddress::parse(start).unwrap(),
        CellAddress::parse(end).unwrap(),
    )
}

#[test]
fn fill_copies_or_clears_both_faces_in_all_four_directions() {
    for replacement in [
        Some(BorderSpec {
            style: BorderStyle::Thin,
            color: Some("#123abc".into()),
        }),
        None,
    ] {
        for (direction, source, target, destination, peer, vertical) in [
            (
                AutoFillDirection::Down,
                "B2",
                range("B2", "B3"),
                "B3",
                "A3",
                true,
            ),
            (
                AutoFillDirection::Up,
                "B3",
                range("B2", "B3"),
                "B2",
                "A2",
                true,
            ),
            (
                AutoFillDirection::Right,
                "B3",
                range("B3", "C3"),
                "C3",
                "C2",
                false,
            ),
            (
                AutoFillDirection::Left,
                "C3",
                range("B3", "C3"),
                "B3",
                "B2",
                false,
            ),
        ] {
            let mut wb = Workbook::new();
            wb.set_cell_input(0, source, "7").unwrap();
            wb.set_cell_input(0, peer, "neighbour").unwrap();
            let mut borders = CellBorders::default();
            if vertical {
                borders.left = replacement.clone();
            } else {
                borders.top = replacement.clone();
            }
            wb.sheet_mut(0).unwrap().set_format(
                source,
                CellFormat {
                    borders,
                    italic: true,
                    ..Default::default()
                },
            );
            wb.sheet_mut(0)
                .unwrap()
                .patch_range_borders(
                    range(destination, destination),
                    if vertical {
                        BorderPreset::Left
                    } else {
                        BorderPreset::Top
                    },
                    BorderSpec {
                        style: BorderStyle::Thick,
                        color: Some("#c00000".into()),
                    },
                )
                .unwrap();
            wb.apply_auto_fill(&AutoFillRequest {
                sheet_idx: 0,
                source_range: range(source, source),
                target_range: target,
                direction,
                series: AutoFillSeries::Copy,
                step: None,
                text_pattern: None,
                list: None,
            })
            .unwrap();
            let adjacent = wb.sheet(0).unwrap().get_format(peer).borders;
            let edge = if vertical {
                adjacent.right
            } else {
                adjacent.bottom
            };
            if let Some(expected) = &replacement {
                assert_eq!(edge.as_ref(), Some(expected), "{direction:?}");
            } else {
                assert!(
                    edge.is_none_or(|b| b.style == BorderStyle::None),
                    "{direction:?}"
                );
            }
            assert!(wb.sheet(0).unwrap().get_format(destination).italic);
            assert_eq!(
                wb.get_cell("Sheet1", peer),
                einfach_core::Value::Text("neighbour".into())
            );
            assert_eq!(
                wb.get_cell("Sheet1", destination),
                einfach_core::Value::Number(7.0)
            );
        }
    }
}

#[test]
fn fill_history_restores_neighbour_merge_segments_without_touching_their_content() {
    for commit in [false, true] {
        let mut wb = Workbook::new();
        let mut history = WorkbookHistory::default();
        for (addr, value) in [
            ("B2", "7"),
            ("B3", "old"),
            ("A3", "neighbour"),
            ("B5", "untouched"),
        ] {
            wb.set_cell_input(0, addr, value).unwrap();
        }
        let red = BorderSpec {
            style: BorderStyle::Thick,
            color: Some("#c00000".into()),
        };
        let blue = BorderSpec {
            style: BorderStyle::Thin,
            color: Some("#123abc".into()),
        };
        let sheet = wb.sheet_mut(0).unwrap();
        sheet
            .restore_merged_ranges(vec![range("A3", "A5")])
            .unwrap();
        sheet.set_format(
            "A3",
            CellFormat {
                borders: CellBorders {
                    right: Some(red.clone()),
                    ..Default::default()
                },
                ..Default::default()
            },
        );
        sheet.set_format(
            "B2",
            CellFormat {
                borders: CellBorders {
                    left: Some(blue.clone()),
                    ..Default::default()
                },
                ..Default::default()
            },
        );
        history
            .begin(&wb, 0, range("B3", "B3"), "Fill", true)
            .unwrap();
        history
            .apply_auto_fill(
                &mut wb,
                &AutoFillRequest {
                    sheet_idx: 0,
                    source_range: range("B2", "B2"),
                    target_range: range("B2", "B3"),
                    direction: AutoFillDirection::Down,
                    series: AutoFillSeries::Copy,
                    step: None,
                    text_pattern: None,
                    list: None,
                },
            )
            .unwrap();
        assert_eq!(
            wb.sheet(0).unwrap().get_format("A3").borders.right,
            Some(blue.clone())
        );
        assert_eq!(
            wb.sheet(0).unwrap().get_format("A5").borders.right,
            Some(red.clone())
        );
        history.finish(&mut wb, commit).unwrap();
        assert_eq!(history.undo_count(), usize::from(commit));
        if commit {
            history.undo(&mut wb).unwrap();
        }
        assert_eq!(
            wb.sheet(0).unwrap().get_format("A3").borders.right,
            Some(red.clone())
        );
        assert_eq!(wb.sheet(0).unwrap().get_format("A5").borders.right, None);
        assert_eq!(
            wb.get_cell("Sheet1", "B3"),
            einfach_core::Value::Text("old".into())
        );
        if commit {
            history.redo(&mut wb).unwrap();
            assert_eq!(
                wb.sheet(0).unwrap().get_format("A3").borders.right,
                Some(blue)
            );
            assert_eq!(
                wb.sheet(0).unwrap().get_format("A5").borders.right,
                Some(red)
            );
        }
        assert_eq!(
            wb.get_cell("Sheet1", "A3"),
            einfach_core::Value::Text("neighbour".into())
        );
        assert_eq!(
            wb.get_cell("Sheet1", "B5"),
            einfach_core::Value::Text("untouched".into())
        );
    }
}
