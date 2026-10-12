//! 多区域格式是同一用户操作；间隙、公式与行列样式遵守原有原生规则。
use einfach_core::Value;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellFormat, CellRange, CellStyle, NumberFormat, StyleScope, Workbook};

fn range(start: &str, end: &str) -> CellRange {
    CellRange::new(CellAddress::parse(start).unwrap(), CellAddress::parse(end).unwrap())
}

#[test]
fn text_colors_and_number_formats_patch_all_targets_with_one_undo_and_keep_the_gap() {
    for patch in [
        CellStyle { bold: Some(true), italic: Some(true), underline: Some(true), ..Default::default() },
        CellStyle { color: Some(Some("#c00000".into())),
            background: Some(Some("#fff2cc".into())), ..Default::default() },
        CellStyle { number_format: Some(NumberFormat::Percent { digits: 2 }), ..Default::default() },
    ] {
        let mut book = Workbook::new();
        let mut history = WorkbookHistory::default();
        book.set_cell_input(0, "A1", "0.25").unwrap();
        book.set_formula(0, "C1", "=A1*2");
        book.sheet_mut(0).unwrap().set_format("B1", CellFormat {
            italic: true, ..Default::default()
        });
        let before = book.sheet(0).unwrap().snapshot_format_range(range("A1", "C1"));
        let targets = [(range("A1", "A1"), StyleScope::Cell), (range("C1", "C1"), StyleScope::Cell)];
        assert_eq!(history.patch_format_selection(&mut book, 0, &targets, patch.clone()).unwrap(),
            range("A1", "C1"));
        let mut expected = CellFormat::default();
        patch.apply_to(&mut expected);
        for address in ["A1", "C1"] {
            assert_eq!(book.sheet(0).unwrap().get_format(address), expected);
        }
        assert_eq!(book.sheet(0).unwrap().get_format("B1"),
            CellFormat { italic: true, ..Default::default() });
        assert_eq!(book.get_cell("Sheet1", "C1"), Value::Number(0.5));
        assert_eq!(book.sheet(0).unwrap().get_formula("C1").as_deref(), Some("=A1*2"));
        let after = book.sheet(0).unwrap().snapshot_format_range(range("A1", "C1"));
        assert_eq!(history.undo_count(), 1);
        history.undo(&mut book).unwrap();
        assert_eq!(book.sheet(0).unwrap().snapshot_format_range(range("A1", "C1")), before);
        history.redo(&mut book).unwrap();
        assert_eq!(book.sheet(0).unwrap().snapshot_format_range(range("A1", "C1")), after);
    }
}

#[test]
fn invalid_later_target_capacity_and_partial_merge_reject_before_any_write() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    book.sheet_mut(0).unwrap().restore_merged_ranges(vec![range("C3", "D4")]).unwrap();
    let patch = CellStyle { bold: Some(true), ..Default::default() };
    for invalid in [range("XFE1", "XFE1"), range("B3", "A2"),
        range("A1", "A100001"), range("C3", "C3")] {
        let targets = [(range("A1", "A1"), StyleScope::Cell), (invalid, StyleScope::Cell)];
        assert!(history.patch_format_selection(&mut book, 0, &targets, patch.clone()).is_err());
        assert!(!book.sheet(0).unwrap().get_format("A1").bold);
        assert_eq!(history.undo_count(), 0);
    }
    assert!(history.patch_format_selection(&mut book, 0, &[], patch.clone()).is_err());
    assert!(history.patch_format_selection(&mut book, 0,
        &vec![(range("A1", "A1"), StyleScope::Cell); 501], patch).is_err());
}

#[test]
fn overlapping_targets_are_idempotent_and_a_repeated_patch_does_not_add_history() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    let targets = [(range("A1", "B2"), StyleScope::Cell), (range("B2", "C3"), StyleScope::Cell)];
    let patch = CellStyle { italic: Some(true), ..Default::default() };
    for _ in 0..2 {
        history.patch_format_selection(&mut book, 0, &targets, patch.clone()).unwrap();
        assert_eq!(history.undo_count(), 1);
    }
    assert!(!book.sheet(0).unwrap().get_format("C1").italic);
    history.undo(&mut book).unwrap();
    assert!(!book.sheet(0).unwrap().get_format("B2").italic);
    assert_eq!(history.undo_count(), 0);
}

#[test]
fn axis_style_updates_restore_far_overrides_but_never_restore_values() {
    for (scope, far) in [(StyleScope::Row, "Z3"), (StyleScope::Column, "C900000")] {
        let mut book = Workbook::new();
        let mut history = WorkbookHistory::default();
        book.sheet_mut(0).unwrap().set_format(far, CellFormat {
            color: Some("#000000".into()), italic: true, ..Default::default()
        });
        let before = book.sheet(0).unwrap().get_format(far);
        let targets = [(range("C3", "C3"), scope), (range("A1", "A1"), StyleScope::Cell)];
        history.patch_format_selection(&mut book, 0, &targets,
            CellStyle { color: Some(Some("#ff0000".into())), ..Default::default() }).unwrap();
        assert_eq!(book.sheet(0).unwrap().get_format(far).color.as_deref(), Some("#ff0000"));
        assert!(book.sheet(0).unwrap().get_format(far).italic);
        book.set_cell_input(0, far, "42").unwrap();
        history.undo(&mut book).unwrap();
        assert_eq!(book.sheet(0).unwrap().get_format(far), before);
        assert_eq!(book.get_cell("Sheet1", far), Value::Number(42.0));
    }
}

#[test]
fn font_size_grows_only_target_rows_and_undo_restores_their_heights() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    let before = book.sheet(0).unwrap().snapshot_format_range(range("A1", "C9"));
    let gap_height = book.sheet(0).unwrap().row_height(4);
    let targets = [(range("A1", "A1"), StyleScope::Cell), (range("C9", "C9"), StyleScope::Cell)];
    history.patch_format_selection(&mut book, 0, &targets,
        CellStyle { font_size: Some(Some(36)), ..Default::default() }).unwrap();
    assert!(book.sheet(0).unwrap().row_height(0).unwrap() >= 36);
    assert!(book.sheet(0).unwrap().row_height(8).unwrap() >= 36);
    assert_eq!(book.sheet(0).unwrap().row_height(4), gap_height);
    history.undo(&mut book).unwrap();
    assert_eq!(book.sheet(0).unwrap().snapshot_format_range(range("A1", "C9")), before);
}

#[test]
fn automatic_color_masks_inheritance_only_in_selected_cells() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    book.sheet_mut(0).unwrap().patch_format_range(range("A1", "C3"), StyleScope::Column,
        CellStyle { color: Some(Some("#ff0000".into())), ..Default::default() });
    let targets = [(range("A1", "A1"), StyleScope::Cell), (range("C3", "C3"), StyleScope::Cell)];
    history.patch_format_selection(&mut book, 0, &targets,
        CellStyle { color: Some(None), ..Default::default() }).unwrap();
    assert_eq!(book.sheet(0).unwrap().get_format("A1").color, None);
    assert_eq!(book.sheet(0).unwrap().get_format("C3").color, None);
    assert_eq!(book.sheet(0).unwrap().get_format("B2").color.as_deref(), Some("#ff0000"));
    history.undo(&mut book).unwrap();
    assert_eq!(book.sheet(0).unwrap().get_format("A1").color.as_deref(), Some("#ff0000"));
}
