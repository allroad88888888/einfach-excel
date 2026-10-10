//! 格式刷复用 Formats 粘贴；两者都必须同步邻格边框并归入同一次历史。
use einfach_excel_core::clipboard::{ClipboardPasteMode, ClipboardPasteOptions};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{
    sheet::BorderPreset, BorderSpec, BorderStyle, CellAddress, CellBorders, CellFormat, CellRange,
    Workbook,
};

fn range(a: &str) -> CellRange {
    CellRange::single(CellAddress::parse(a).unwrap())
}
fn pen(style: BorderStyle, color: &str) -> BorderSpec {
    BorderSpec {
        style,
        color: Some(color.into()),
    }
}
fn workbook() -> Workbook {
    let mut wb = Workbook::new();
    wb.set_cell_input(0, "A1", "source").unwrap();
    wb.set_cell_input(0, "C3", "target").unwrap();
    wb.sheet_mut(0)
        .unwrap()
        .patch_range_borders(
            range("B3"),
            BorderPreset::Right,
            pen(BorderStyle::Thick, "#c00000"),
        )
        .unwrap();
    wb
}

#[test]
fn format_paste_replaces_both_faces_and_undo_redo_restores_neighbours() {
    let mut wb = workbook();
    let blue = pen(BorderStyle::Thin, "#123abc");
    wb.sheet_mut(0).unwrap().set_format(
        "A1",
        CellFormat {
            borders: CellBorders {
                left: Some(blue.clone()),
                ..Default::default()
            },
            ..Default::default()
        },
    );
    let source = wb.capture_clipboard(0, range("A1"), false).unwrap();
    let mut options = ClipboardPasteOptions::new(range("C3"));
    options.mode = ClipboardPasteMode::Formats;
    let mut history = WorkbookHistory::default();
    wb.paste_clipboard_with_history(&source, 0, &options, &mut history)
        .unwrap();
    for edge in [
        wb.sheet(0).unwrap().get_format("B3").borders.right,
        wb.sheet(0).unwrap().get_format("C3").borders.left,
    ] {
        assert_eq!(edge, Some(blue.clone()));
    }
    assert_eq!(
        wb.get_cell("Sheet1", "C3"),
        einfach_core::Value::Text("target".into())
    );
    assert_eq!(history.undo_count(), 1);
    history.undo(&mut wb).unwrap();
    assert_eq!(
        wb.sheet(0).unwrap().get_format("B3").borders.right,
        Some(pen(BorderStyle::Thick, "#c00000"))
    );
    history.redo(&mut wb).unwrap();
    assert_eq!(
        wb.sheet(0).unwrap().get_format("B3").borders.right,
        Some(blue)
    );
}

#[test]
fn pasting_default_formats_clears_shared_edges_and_undo_keeps_content() {
    let mut wb = workbook();
    let source = wb.capture_clipboard(0, range("A1"), false).unwrap();
    let mut options = ClipboardPasteOptions::new(range("C3"));
    options.mode = ClipboardPasteMode::Formats;
    let mut history = WorkbookHistory::default();
    wb.paste_clipboard_with_history(&source, 0, &options, &mut history)
        .unwrap();
    assert!(wb
        .sheet(0)
        .unwrap()
        .get_format("B3")
        .borders
        .right
        .is_none_or(|border| border.style == BorderStyle::None));
    history.undo(&mut wb).unwrap();
    assert_eq!(
        wb.sheet(0).unwrap().get_format("B3").borders.right,
        Some(pen(BorderStyle::Thick, "#c00000"))
    );
    assert_eq!(
        wb.get_cell("Sheet1", "C3"),
        einfach_core::Value::Text("target".into())
    );
}

#[test]
fn values_only_paste_does_not_change_shared_borders() {
    let mut wb = workbook();
    let source = wb.capture_clipboard(0, range("A1"), false).unwrap();
    let mut options = ClipboardPasteOptions::new(range("C3"));
    options.mode = ClipboardPasteMode::Values;
    let before = wb.sheet(0).unwrap().get_format("B3");
    wb.paste_clipboard(&source, 0, &options).unwrap();
    assert_eq!(wb.sheet(0).unwrap().get_format("B3"), before);
    assert_eq!(
        wb.sheet(0).unwrap().get_format("C3").borders.left,
        before.borders.right
    );
}

#[test]
fn cut_moves_the_border_and_history_restores_both_source_and_target_neighbours() {
    let mut wb = workbook();
    wb.set_cell_input(0, "B3", "move").unwrap();
    let source = wb.capture_clipboard(0, range("B3"), true).unwrap();
    let mut history = WorkbookHistory::default();
    wb.paste_clipboard_with_history(
        &source,
        0,
        &ClipboardPasteOptions::new(range("F3")),
        &mut history,
    )
    .unwrap();
    assert!(wb
        .sheet(0)
        .unwrap()
        .get_format("C3")
        .borders
        .left
        .is_none_or(|border| border.style == BorderStyle::None));
    let red = pen(BorderStyle::Thick, "#c00000");
    assert_eq!(
        wb.sheet(0).unwrap().get_format("G3").borders.left,
        Some(red.clone())
    );
    history.undo(&mut wb).unwrap();
    assert_eq!(
        wb.sheet(0).unwrap().get_format("C3").borders.left,
        Some(red)
    );
    assert_eq!(wb.sheet(0).unwrap().get_format("G3").borders.left, None);
    assert_eq!(
        wb.get_cell("Sheet1", "B3"),
        einfach_core::Value::Text("move".into())
    );
}

#[test]
fn scalar_format_paste_covers_a_merged_perimeter_and_restores_outside_styles() {
    let mut wb = workbook();
    let target = CellRange::new(range("C3").start, range("D4").start);
    wb.merge_cells(0, target, einfach_excel_core::MergeAction::Merge, false)
        .unwrap();
    let blue = pen(BorderStyle::Thin, "#123abc");
    wb.sheet_mut(0)
        .unwrap()
        .patch_range_borders(range("A1"), BorderPreset::All, blue.clone())
        .unwrap();
    let source = wb.capture_clipboard(0, range("A1"), false).unwrap();
    let mut options = ClipboardPasteOptions::new(target);
    options.mode = ClipboardPasteMode::Formats;
    let mut history = WorkbookHistory::default();
    wb.paste_clipboard_with_history(&source, 0, &options, &mut history)
        .unwrap();
    for addr in ["D3", "D4"] {
        assert_eq!(
            wb.sheet(0).unwrap().get_format(addr).borders.right,
            Some(blue.clone())
        );
    }
    for addr in ["E3", "E4"] {
        assert_eq!(
            wb.sheet(0).unwrap().get_format(addr).borders.left,
            Some(blue.clone())
        );
    }
    history.undo(&mut wb).unwrap();
    assert_eq!(
        wb.sheet(0).unwrap().get_format("B3").borders.right,
        Some(pen(BorderStyle::Thick, "#c00000"))
    );
    assert_eq!(wb.sheet(0).unwrap().get_format("E3").borders.left, None);
    assert_eq!(wb.sheet(0).unwrap().merged_ranges(), &[target]);
}

#[test]
fn merged_copy_preserves_anchor_defaults_and_a_different_physical_segment() {
    let mut wb = Workbook::new();
    let source_range = CellRange::new(range("A1").start, range("C3").start);
    wb.merge_cells(
        0,
        source_range,
        einfach_excel_core::MergeAction::Merge,
        false,
    )
    .unwrap();
    let red = pen(BorderStyle::Thick, "#c00000");
    let blue = pen(BorderStyle::Thin, "#123abc");
    wb.sheet_mut(0).unwrap().set_format(
        "A1",
        CellFormat {
            borders: CellBorders {
                top: Some(red.clone()),
                ..Default::default()
            },
            ..Default::default()
        },
    );
    wb.sheet_mut(0).unwrap().set_format(
        "B1",
        CellFormat {
            borders: CellBorders {
                top: Some(blue.clone()),
                ..Default::default()
            },
            ..Default::default()
        },
    );
    let source = wb.capture_clipboard(0, source_range, false).unwrap();
    let mut history = WorkbookHistory::default();
    wb.paste_clipboard_with_history(
        &source,
        0,
        &ClipboardPasteOptions::new(range("F6")),
        &mut history,
    )
    .unwrap();
    for (addr, edge) in [
        ("F5", red.clone()),
        ("G5", blue.clone()),
        ("H5", red.clone()),
    ] {
        assert_eq!(
            wb.sheet(0).unwrap().get_format(addr).borders.bottom,
            Some(edge)
        );
    }
    assert_eq!(
        wb.sheet(0).unwrap().get_format("G6").borders.top,
        Some(blue)
    );
    assert_eq!(wb.sheet(0).unwrap().get_format("H6").borders.top, Some(red));
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.sheet(0).unwrap().get_format("F5").borders.bottom, None);
    assert_eq!(wb.sheet(0).unwrap().merged_ranges(), &[source_range]);
}
