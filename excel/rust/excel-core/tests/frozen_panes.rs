use einfach_core::Value;
use einfach_excel_core::shift::ShiftEdit;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{FrozenPanes, Workbook};

#[test]
fn freeze_and_unfreeze_share_history_without_touching_cells() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(12.0));
    wb.set_formula(0, "B1", "=A1*2");
    wb.add_sheet("Other");
    let mut history = WorkbookHistory::default();
    for freeze in [
        FrozenPanes { rows: 1, cols: 0 },
        FrozenPanes { rows: 0, cols: 1 },
        FrozenPanes { rows: 3, cols: 2 },
        FrozenPanes::default(),
    ] {
        assert!(history.set_frozen_panes(&mut wb, 0, freeze).unwrap());
        assert_eq!(wb.sheet(0).unwrap().frozen_panes(), freeze);
        assert_eq!(wb.sheet(1).unwrap().frozen_panes(), FrozenPanes::default());
        assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(24.0));
    }
    assert_eq!(history.undo_count(), 4);
    history.undo(&mut wb).unwrap();
    assert_eq!(
        wb.sheet(0).unwrap().frozen_panes(),
        FrozenPanes { rows: 3, cols: 2 }
    );
    history.redo(&mut wb).unwrap();
    assert_eq!(wb.sheet(0).unwrap().frozen_panes(), FrozenPanes::default());
}

#[test]
fn invalid_or_unchanged_freeze_keeps_redo_and_does_not_allocate_cells() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    history
        .set_frozen_panes(
            &mut wb,
            0,
            FrozenPanes {
                rows: 1_000_000,
                cols: 16_000,
            },
        )
        .unwrap();
    assert_eq!(wb.sheet(0).unwrap().debug_primitive_atom_count(), 0);
    assert_eq!(wb.sheet(0).unwrap().debug_formula_count(), 0);
    history.undo(&mut wb).unwrap();
    assert!(!history
        .set_frozen_panes(&mut wb, 0, FrozenPanes::default())
        .unwrap());
    for (sheet, freeze) in [
        (
            0,
            FrozenPanes {
                rows: 1_048_576,
                cols: 0,
            },
        ),
        (
            0,
            FrozenPanes {
                rows: 0,
                cols: 16_384,
            },
        ),
        (9, FrozenPanes::default()),
    ] {
        assert!(history.set_frozen_panes(&mut wb, sheet, freeze).is_err());
    }
    assert_eq!(history.redo_count(), 1);
}

#[test]
fn structural_history_restores_frozen_band_exactly() {
    let mut wb = Workbook::new();
    let original = FrozenPanes { rows: 4, cols: 3 };
    wb.sheet_mut(0).unwrap().set_frozen_panes(original).unwrap();
    let mut history = WorkbookHistory::default();
    for (edit, expected) in [
        (
            ShiftEdit::RowInsert { at: 1, count: 2 },
            FrozenPanes { rows: 6, cols: 3 },
        ),
        (ShiftEdit::RowInsert { at: 4, count: 2 }, original),
        (
            ShiftEdit::RowDelete { at: 2, count: 8 },
            FrozenPanes { rows: 2, cols: 3 },
        ),
        (
            ShiftEdit::ColInsert { at: 0, count: 2 },
            FrozenPanes { rows: 4, cols: 5 },
        ),
        (
            ShiftEdit::ColDelete { at: 0, count: 8 },
            FrozenPanes { rows: 4, cols: 0 },
        ),
    ] {
        history.edit_structure(&mut wb, 0, edit).unwrap();
        assert_eq!(wb.sheet(0).unwrap().frozen_panes(), expected);
        history.undo(&mut wb).unwrap();
        assert_eq!(wb.sheet(0).unwrap().frozen_panes(), original);
        history.redo(&mut wb).unwrap();
        assert_eq!(wb.sheet(0).unwrap().frozen_panes(), expected);
        history.undo(&mut wb).unwrap();
    }
}

#[test]
fn insertion_cannot_push_freeze_boundary_outside_native_grid() {
    let mut wb = Workbook::new();
    let freeze = FrozenPanes {
        rows: 1_048_575,
        cols: 16_383,
    };
    wb.sheet_mut(0).unwrap().set_frozen_panes(freeze).unwrap();
    let mut history = WorkbookHistory::default();
    for edit in [
        ShiftEdit::RowInsert { at: 0, count: 1 },
        ShiftEdit::ColInsert { at: 0, count: 1 },
    ] {
        assert!(history.edit_structure(&mut wb, 0, edit).is_err());
        assert_eq!(wb.sheet(0).unwrap().frozen_panes(), freeze);
        assert_eq!(history.undo_count(), 0);
    }
}

#[test]
fn sheet_move_and_delete_history_keep_freeze_on_the_same_sheet() {
    let mut wb = Workbook::new();
    wb.add_sheet("Other");
    let mut history = WorkbookHistory::default();
    let freeze = FrozenPanes { rows: 5, cols: 2 };
    history.set_frozen_panes(&mut wb, 0, freeze).unwrap();
    history.move_sheet(&mut wb, 0, 1).unwrap();
    assert_eq!(wb.sheet(1).unwrap().frozen_panes(), freeze);
    history.remove_sheet(&mut wb, 1).unwrap();
    assert_eq!(wb.sheet(0).unwrap().frozen_panes(), FrozenPanes::default());
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.sheet(1).unwrap().frozen_panes(), freeze);
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.sheet(0).unwrap().frozen_panes(), freeze);
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.sheet(0).unwrap().frozen_panes(), FrozenPanes::default());
}
