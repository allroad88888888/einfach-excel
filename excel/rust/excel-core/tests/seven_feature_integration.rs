//! 跨共享写入面的回归使用真实原生 Workbook，不替换权限或历史实现。
use einfach_core::Value;
use einfach_excel_core::{BorderSpec, BorderStyle, CellAddress, CellBorders, CellRange, CellStyle,
    StyleScope, Workbook};
use einfach_excel_core::protection::{ProtectionChange, PROTECTED_ERROR};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::sheet::BorderPreset;

fn range(row: u32, col: u32, row_end: u32, col_end: u32) -> CellRange {
    CellRange::new(CellAddress::new(row, col), CellAddress::new(row_end, col_end))
}

#[test]
fn editable_notes_and_content_share_history_without_overwriting_each_other() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    let addr = CellAddress::new(1, 1);
    book.change_protection(0, ProtectionChange::AllowRange { range: range(1, 1, 1, 1).into() }).unwrap();
    book.change_protection(0, ProtectionChange::Protect).unwrap();
    history.change_note(&mut book, 0, addr, Some("Keep note")).unwrap();
    history.set_cell_input(&mut book, 0, "B2", "42").unwrap();
    assert_eq!(book.sheet(0).unwrap().note(addr), Some("Keep note"));
    history.undo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "B2"), Value::Null);
    assert_eq!(book.sheet(0).unwrap().note(addr), Some("Keep note"));
    assert!(history.change_note(&mut book, 0, CellAddress::new(2, 2), Some("Locked")).is_err());
    assert_eq!((history.undo_count(), history.redo_count()), (1, 1));
    history.undo(&mut book).unwrap();
    assert_eq!(book.sheet(0).unwrap().note(addr), None);
}

#[test]
fn multi_area_format_preflights_later_neighbor_before_any_write_and_preserves_redo() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    book.set_cell(0, "B2", Value::Number(11.));
    book.set_cell(0, "F6", Value::Number(22.));
    history.set_cell_input(&mut book, 0, "A20", "9").unwrap();
    history.undo(&mut book).unwrap();
    for target in [range(0, 0, 2, 2), range(4, 4, 6, 5)] {
        book.change_protection(0, ProtectionChange::AllowRange { range: target.into() }).unwrap();
    }
    book.change_protection(0, ProtectionChange::Protect).unwrap();
    let before: Vec<_> = (0..8).flat_map(|row| (0..8).map(move |col| CellAddress::new(row, col)))
        .map(|addr| (addr, book.sheet(0).unwrap().get_format(&addr.to_string()))).collect();
    let edge = Some(BorderSpec { style: BorderStyle::Thin, color: Some("#123456".into()) });
    let patch = CellStyle { bold: Some(true), borders: Some(CellBorders {
        top: edge.clone(), right: edge.clone(), bottom: edge.clone(), left: edge,
    }), ..Default::default() };
    let targets = [(range(1, 1, 1, 1), StyleScope::Cell),
        (range(5, 5, 5, 5), StyleScope::Cell)];
    assert_eq!(history.patch_format_selection(&mut book, 0, &targets, patch.clone()), Err(PROTECTED_ERROR));
    assert_eq!((history.undo_count(), history.redo_count()), (0, 1));
    for (addr, format) in before {
        assert_eq!(book.sheet(0).unwrap().get_format(&addr.to_string()), format);
    }
    assert_eq!(book.get_cell("Sheet1", "B2"), Value::Number(11.));
    assert_eq!(book.get_cell("Sheet1", "F6"), Value::Number(22.));

    // 中间整片锁定区域不相关；只补足第二区真正要写的邻边后即可成功。
    book.change_protection(0, ProtectionChange::Unprotect).unwrap();
    book.change_protection(0, ProtectionChange::AllowRange { range: range(4, 4, 6, 6).into() }).unwrap();
    book.change_protection(0, ProtectionChange::Protect).unwrap();
    history.patch_format_selection(&mut book, 0, &targets, patch).unwrap();
    assert_eq!((history.undo_count(), history.redo_count()), (1, 0));
    assert!(book.sheet(0).unwrap().get_format("B2").bold);
    assert!(book.sheet(0).unwrap().get_format("F6").bold);
    assert!(book.sheet(0).unwrap().get_format("G6").borders.left.is_some());
    assert_eq!(book.get_cell("Sheet1", "B2"), Value::Number(11.));
    assert_eq!(book.get_cell("Sheet1", "F6"), Value::Number(22.));
}

#[test]
fn sparse_border_history_ignores_locked_corners_for_write_undo_and_redo() {
    for selection_patch in [false, true] {
        let mut book = Workbook::new();
        let mut history = WorkbookHistory::default();
        book.set_cell(0, "B2", Value::Number(9.));
        // 只允许实际十字写入；四个包围角格仍锁定。
        for target in [range(0, 1, 0, 1), range(1, 0, 1, 2), range(2, 1, 2, 1)] {
            book.change_protection(0, ProtectionChange::AllowRange { range: target.into() }).unwrap();
        }
        book.change_protection(0, ProtectionChange::Protect).unwrap();
        let border = BorderSpec { style: BorderStyle::Thin, color: Some("#123456".into()) };
        if selection_patch {
            let edge = Some(border);
            history.patch_format_selection(&mut book, 0, &[(range(1, 1, 1, 1), StyleScope::Cell)],
                CellStyle { borders: Some(CellBorders { top: edge.clone(), right: edge.clone(),
                    bottom: edge.clone(), left: edge }), ..Default::default() }).unwrap();
        } else {
            history.patch_range_borders(&mut book, 0, range(1, 1, 1, 1), BorderPreset::All, border).unwrap();
        }
        assert!(book.sheet(0).unwrap().get_format("C2").borders.left.is_some());
        assert_eq!((history.undo_count(), history.redo_count()), (1, 0));
        history.undo(&mut book).unwrap();
        assert_eq!(book.sheet(0).unwrap().get_format("C2").borders, CellBorders::default());
        assert_eq!(book.get_cell("Sheet1", "B2"), Value::Number(9.));
        history.redo(&mut book).unwrap();
        assert!(book.sheet(0).unwrap().get_format("C2").borders.left.is_some());
        assert_eq!(book.sheet(0).unwrap().get_format("A1").borders, CellBorders::default());
    }
}

#[test]
fn top_and_outside_borders_ignore_locked_unwritten_selection_cells() {
    for preset in [BorderPreset::Top, BorderPreset::Outside] {
        let mut book = Workbook::new();
        let mut history = WorkbookHistory::default();
        let allowed = if preset == BorderPreset::Top { vec![range(0, 1, 1, 3)] }
            else { vec![range(0, 0, 1, 4), range(3, 0, 4, 4),
                range(2, 0, 2, 1), range(2, 3, 2, 4)] };
        for target in allowed {
            book.change_protection(0, ProtectionChange::AllowRange { range: target.into() }).unwrap();
        }
        book.change_protection(0, ProtectionChange::Protect).unwrap();
        history.patch_range_borders(&mut book, 0, range(1, 1, 3, 3), preset,
            BorderSpec { style: BorderStyle::Thin, color: Some("#123456".into()) }).unwrap();
        assert!(book.sheet(0).unwrap().get_format("C2").borders.top.is_some());
        assert_eq!(book.sheet(0).unwrap().get_format("C3").borders, CellBorders::default());
        history.undo(&mut book).unwrap();
        assert_eq!(book.sheet(0).unwrap().get_format("C2").borders, CellBorders::default());
        history.redo(&mut book).unwrap();
        assert!(book.sheet(0).unwrap().get_format("C2").borders.top.is_some());
    }
}

#[test]
fn dimension_history_cannot_use_one_editable_cell_to_change_a_whole_axis() {
    for axis in ["row", "column"] {
        for auto_fit in [false, true] {
            let mut book = Workbook::new();
            let mut history = WorkbookHistory::default();
            let target = range(1, 1, 1, 1);
            book.set_cell(0, "B2", Value::Text("Measure".into()));
            history.begin(&book, 0, target, "Dimension", false).unwrap();
            if auto_fit {
                book.auto_fit_dimensions(0, target, axis, 28, 96, |_, _, _| Ok(120.)).unwrap();
            } else {
                book.sheet_mut(0).unwrap().resize_range(target, axis, 120).unwrap();
            }
            history.finish(&mut book, true).unwrap();
            book.change_protection(0, ProtectionChange::AllowRange { range: target.into() }).unwrap();
            book.change_protection(0, ProtectionChange::Protect).unwrap();
            assert_eq!(history.undo(&mut book), Err(PROTECTED_ERROR));
            assert_eq!((history.undo_count(), history.redo_count()), (1, 0));
            let size = |book: &Workbook| if axis == "row" { book.sheet(0).unwrap().row_height(1) }
                else { book.sheet(0).unwrap().col_width(1) };
            assert_eq!(size(&book), Some(120));
            book.change_protection(0, ProtectionChange::Unprotect).unwrap();
            history.undo(&mut book).unwrap();
            assert_eq!(size(&book), None);
            book.change_protection(0, ProtectionChange::Protect).unwrap();
            assert_eq!(history.redo(&mut book), Err(PROTECTED_ERROR));
            assert_eq!((history.undo_count(), history.redo_count()), (0, 1));
            assert_eq!(size(&book), None);
            assert_eq!(book.get_cell("Sheet1", "B2"), Value::Text("Measure".into()));
        }
    }
}

#[test]
fn editable_cell_font_and_multiline_autoheight_remain_undoable() {
    for font in [true, false] {
        let mut book = Workbook::new();
        let mut history = WorkbookHistory::default();
        let target = range(1, 1, 1, 1);
        book.change_protection(0, ProtectionChange::AllowRange { range: target.into() }).unwrap();
        book.change_protection(0, ProtectionChange::Protect).unwrap();
        if font {
            history.patch_format_selection(&mut book, 0, &[(target, StyleScope::Cell)],
                CellStyle { font_size: Some(Some(36)), ..Default::default() }).unwrap();
        } else {
            history.set_cell_input(&mut book, 0, "B2", "first\nsecond").unwrap();
        }
        let height = book.sheet(0).unwrap().row_height(1);
        assert!(height.is_some_and(|height| height > 28));
        history.undo(&mut book).unwrap();
        assert_eq!(book.sheet(0).unwrap().row_height(1), None);
        assert_eq!(book.get_cell("Sheet1", "B2"), Value::Null);
        history.redo(&mut book).unwrap();
        assert_eq!(book.sheet(0).unwrap().row_height(1), height);
        if font { assert_eq!(book.sheet(0).unwrap().get_format("B2").font_size, Some(36)); }
        else { assert_eq!(book.get_cell("Sheet1", "B2"), Value::Text("first\nsecond".into())); }
        assert_eq!((history.undo_count(), history.redo_count()), (1, 0));
    }
}

#[test]
fn explicit_dimension_reset_requires_sheet_permission_during_history() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    let target = range(1, 1, 1, 1);
    book.sheet_mut(0).unwrap().set_row_height(1, 80);
    book.sheet_mut(0).unwrap().set_col_width(1, 160);
    history.begin(&book, 0, target, "Reset", false).unwrap();
    book.sheet_mut(0).unwrap().resize_range(target, "reset", 0).unwrap();
    history.finish(&mut book, true).unwrap();
    book.change_protection(0, ProtectionChange::AllowRange { range: target.into() }).unwrap();
    book.change_protection(0, ProtectionChange::Protect).unwrap();
    assert_eq!(history.undo(&mut book), Err(PROTECTED_ERROR));
    assert_eq!(book.sheet(0).unwrap().row_height(1), None);
    assert_eq!(book.sheet(0).unwrap().col_width(1), None);
    assert_eq!((history.undo_count(), history.redo_count()), (1, 0));
    book.change_protection(0, ProtectionChange::Unprotect).unwrap();
    history.undo(&mut book).unwrap();
    book.change_protection(0, ProtectionChange::Protect).unwrap();
    assert_eq!(history.redo(&mut book), Err(PROTECTED_ERROR));
    assert_eq!(book.sheet(0).unwrap().row_height(1), Some(80));
    assert_eq!(book.sheet(0).unwrap().col_width(1), Some(160));
    assert_eq!((history.undo_count(), history.redo_count()), (0, 1));
}

#[test]
fn note_history_preserves_unrelated_external_dimensions_and_changed_axes_detect_conflicts() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    let target = range(1, 1, 1, 1);
    history.change_note(&mut book, 0, target.start, Some("Keep size")).unwrap();
    book.sheet_mut(0).unwrap().set_row_height(1, 80);
    book.sheet_mut(0).unwrap().set_col_width(1, 160);
    book.change_protection(0, ProtectionChange::AllowRange { range: target.into() }).unwrap();
    book.change_protection(0, ProtectionChange::Protect).unwrap();
    history.undo(&mut book).unwrap();
    history.redo(&mut book).unwrap();
    assert_eq!(book.sheet(0).unwrap().row_height(1), Some(80));
    assert_eq!(book.sheet(0).unwrap().col_width(1), Some(160));

    history.patch_format_selection(&mut book, 0, &[(target, StyleScope::Cell)],
        CellStyle { font_size: Some(Some(100)), ..Default::default() }).unwrap();
    book.change_protection(0, ProtectionChange::Unprotect).unwrap();
    book.sheet_mut(0).unwrap().set_row_height(1, 200);
    book.change_protection(0, ProtectionChange::Protect).unwrap();
    assert_eq!(history.undo(&mut book), Err("The worksheet dimensions changed outside history."));
    assert_eq!(book.sheet(0).unwrap().row_height(1), Some(200));
    assert_eq!(book.sheet(0).unwrap().get_format("B2").font_size, Some(100));
    assert_eq!(book.sheet(0).unwrap().note(target.start), Some("Keep size"));
    assert_eq!((history.undo_count(), history.redo_count()), (2, 0));
}
