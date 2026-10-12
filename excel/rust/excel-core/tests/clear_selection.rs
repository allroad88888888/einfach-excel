//! 多区域清除由一个原生事务承担；不把中途状态记成撤销目标。
use einfach_core::Value;
use einfach_excel_core::workbook_history::{ClearSelectionMode, WorkbookHistory};
use einfach_excel_core::{
    sheet::BorderPreset, BorderSpec, BorderStyle, CellAddress, CellFormat, CellRange,
    CellStyle, StyleScope, Workbook,
};

fn range(start: &str, end: &str) -> CellRange {
    CellRange::new(CellAddress::parse(start).unwrap(), CellAddress::parse(end).unwrap())
}

#[test]
fn overlapping_extra_format_snapshots_restore_the_initial_state_not_an_intermediate_one() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    let red = BorderSpec { style: BorderStyle::Thick, color: Some("#c00000".into()) };
    book.sheet_mut(0).unwrap().patch_range_borders(
        range("C3", "D3"), BorderPreset::All, red,
    ).unwrap();
    let before = book.sheet(0).unwrap().snapshot_format_range(range("A1", "F5"));
    history.begin(&book, 0, range("C3", "D3"), "Clear formats", false).unwrap();
    for address in ["C3", "D3"] {
        history.patch_format_range(&mut book, 0, range(address, address), StyleScope::Cell,
            CellStyle::from_format(CellFormat::default())).unwrap();
    }
    history.finish(&mut book, true).unwrap();
    let after = book.sheet(0).unwrap().snapshot_format_range(range("A1", "F5"));
    assert_ne!(before, after);
    assert_eq!(history.undo_count(), 1);
    history.undo(&mut book).unwrap();
    assert_eq!(book.sheet(0).unwrap().snapshot_format_range(range("A1", "F5")), before);
    history.redo(&mut book).unwrap();
    assert_eq!(book.sheet(0).unwrap().snapshot_format_range(range("A1", "F5")), after);
}

#[test]
fn three_clear_modes_change_all_areas_and_undo_once_without_touching_the_gap() {
    for mode in [ClearSelectionMode::Contents, ClearSelectionMode::Formats, ClearSelectionMode::All] {
        let mut book = Workbook::new();
        let mut history = WorkbookHistory::default();
        for (address, input) in [("A1", "10"), ("B1", "gap"), ("C1", "=A1*2")] {
            book.set_cell_input(0, address, input).unwrap();
            book.sheet_mut(0).unwrap().set_format(address,
                CellFormat { bold: true, ..Default::default() });
        }
        let targets = [(range("A1", "A1"), StyleScope::Cell),
            (range("C1", "C1"), StyleScope::Cell)];
        history.clear_selection(&mut book, 0, &targets, mode).unwrap();
        assert_eq!(history.undo_count(), 1);
        assert_eq!(book.get_cell("Sheet1", "B1"), Value::Text("gap".into()));
        assert!(book.sheet(0).unwrap().get_format("B1").bold);
        assert_eq!(book.sheet(0).unwrap().get_format("A1").bold, mode == ClearSelectionMode::Contents);
        assert_eq!(book.sheet(0).unwrap().get_formula("C1").is_some(), mode == ClearSelectionMode::Formats);
        assert_eq!(book.get_cell("Sheet1", "A1"), if mode == ClearSelectionMode::Formats {
            Value::Number(10.0)
        } else { Value::Null });
        history.undo(&mut book).unwrap();
        assert_eq!(book.get_cell("Sheet1", "C1"), Value::Number(20.0));
        assert!(book.sheet(0).unwrap().get_format("A1").bold);
        assert_eq!(history.undo_count(), 0);
        history.redo(&mut book).unwrap();
        assert_eq!(history.undo_count(), 1);
    }
}

#[test]
fn a_later_invalid_target_or_format_capacity_error_rejects_before_the_first_write() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    book.set_cell_input(0, "A1", "keep").unwrap();
    for invalid in [range("XFE1", "XFE1"), range("B3", "A2"), range("A1", "A100001")] {
        let targets = [(range("A1", "A1"), StyleScope::Cell), (invalid, StyleScope::Cell)];
        assert!(history.clear_selection(&mut book, 0, &targets, ClearSelectionMode::All).is_err());
        assert_eq!(book.get_cell("Sheet1", "A1"), Value::Text("keep".into()));
        assert_eq!(history.undo_count(), 0);
    }
    assert!(history.clear_selection(&mut book, 0, &[], ClearSelectionMode::Contents).is_err());
    let targets = vec![(range("A1", "A1"), StyleScope::Cell); 501];
    assert!(history.clear_selection(&mut book, 0, &targets, ClearSelectionMode::Contents).is_err());
}

#[test]
fn whole_sheet_content_clear_is_sparse_and_restores_the_last_formula() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    book.set_formula(0, "XFD1048576", "=2+3");
    let targets = [(range("A1", "XFD1048576"), StyleScope::Cell)];
    history.clear_selection(&mut book, 0, &targets, ClearSelectionMode::Contents).unwrap();
    assert_eq!(book.get_cell("Sheet1", "XFD1048576"), Value::Null);
    assert!(book.debug_total_atom_count(0) < 50);
    history.undo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "XFD1048576"), Value::Number(5.0));
}

#[test]
fn overlapping_targets_restore_all_shared_borders_and_rollback_reverses_extra_snapshots() {
    for success in [true, false] {
        let mut book = Workbook::new();
        let mut history = WorkbookHistory::default();
        book.sheet_mut(0).unwrap().patch_range_borders(range("C3", "E3"), BorderPreset::All,
            BorderSpec { style: BorderStyle::Thick, color: None }).unwrap();
        let before = book.sheet(0).unwrap().snapshot_format_range(range("A1", "G5"));
        if success {
            history.clear_selection(&mut book, 0, &[(range("C3", "D3"), StyleScope::Cell),
                (range("D3", "E3"), StyleScope::Cell)], ClearSelectionMode::Formats).unwrap();
            history.undo(&mut book).unwrap();
        } else {
            history.begin(&book, 0, range("C3", "E3"), "Fail", false).unwrap();
            for address in ["C3", "D3", "E3"] {
                history.patch_format_range(&mut book, 0, range(address, address), StyleScope::Cell,
                    CellStyle::from_format(CellFormat::default())).unwrap();
            }
            history.finish(&mut book, false).unwrap();
        }
        assert_eq!(book.sheet(0).unwrap().snapshot_format_range(range("A1", "G5")), before);
        assert_eq!(history.undo_count(), 0);
    }
}

#[test]
fn partial_spill_rejects_all_targets_but_a_separate_selected_anchor_can_be_cleared() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    book.set_cell_input(0, "C1", "keep").unwrap();
    book.set_formula(0, "A1", "=SEQUENCE(3)");
    let targets = [(range("C1", "C1"), StyleScope::Cell), (range("A2", "A3"), StyleScope::Cell)];
    assert!(history.clear_selection(&mut book, 0, &targets, ClearSelectionMode::Contents).is_err());
    assert_eq!(book.get_cell("Sheet1", "C1"), Value::Text("keep".into()));
    assert_eq!(history.undo_count(), 0);
    let targets = [(range("A2", "A3"), StyleScope::Cell), (range("A1", "A1"), StyleScope::Cell)];
    history.clear_selection(&mut book, 0, &targets, ClearSelectionMode::Contents).unwrap();
    assert_eq!(book.get_cell("Sheet1", "A3"), Value::Null);
    history.undo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "A3"), Value::Number(3.0));
}

#[test]
fn row_and_column_format_clear_restore_far_intersections_and_keep_dimensions() {
    for (scope, far) in [(StyleScope::Row, "Z3"), (StyleScope::Column, "C900000")] {
        let mut book = Workbook::new();
        let mut history = WorkbookHistory::default();
        let original = CellFormat { bold: true, font_size: Some(36), ..Default::default() };
        book.sheet_mut(0).unwrap().set_format(far, original.clone());
        book.sheet_mut(0).unwrap().set_col_width(2, 200);
        let row = CellAddress::parse(far).unwrap().row;
        let height = book.sheet(0).unwrap().row_height(row);
        history.clear_selection(&mut book, 0, &[(range("C3", "C3"), scope),
            (range("A1", "A1"), StyleScope::Cell)], ClearSelectionMode::Formats).unwrap();
        assert!(!book.sheet(0).unwrap().get_format(far).bold);
        assert_eq!(book.sheet(0).unwrap().row_height(row), height);
        assert_eq!(book.sheet(0).unwrap().col_width(2), Some(200));
        history.undo(&mut book).unwrap();
        assert_eq!(book.sheet(0).unwrap().get_format(far), original);
    }
}
