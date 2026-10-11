//! 分组必须参与原生历史，并保留手动隐藏、筛选和公式可见性语义。
use einfach_core::Value;
use einfach_excel_core::outline::{OutlineAction as Action, OutlineAxis as Axis};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, Workbook};

fn area(start: u32, end: u32) -> CellRange {
    CellRange::new(CellAddress::new(start, 0), CellAddress::new(end, 0))
}

#[test]
fn collapse_is_reactive_and_expand_does_not_unhide_manual_rows() {
    let mut book = Workbook::new();
    for row in 1..=5 {
        book.set_cell(0, &format!("A{row}"), Value::Number(1.0));
    }
    book.set_formula(0, "B1", "=SUBTOTAL(109,A1:A5)");
    book.set_formula(0, "B2", "=SUBTOTAL(9,A1:A5)");
    book.hide_rows(0, &[2]);
    assert_eq!(book.get_cell("Sheet1", "B1"), Value::Number(4.0));
    let mut history = WorkbookHistory::default();
    history
        .change_outline(&mut book, 0, Axis::Row, Action::Group { start: 1, end: 3 })
        .unwrap();
    history
        .change_outline(
            &mut book,
            0,
            Axis::Row,
            Action::SetCollapsed {
                index: 0,
                collapsed: true,
            },
        )
        .unwrap();
    assert_eq!(book.get_cell("Sheet1", "B1"), Value::Number(2.0));
    assert_eq!(book.get_cell("Sheet1", "B2"), Value::Number(5.0));
    assert_eq!(book.list_hidden_rows(0), vec![2]);
    history.undo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "B1"), Value::Number(4.0));
    history.redo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "B1"), Value::Number(2.0));
    history
        .change_outline(
            &mut book,
            0,
            Axis::Row,
            Action::SetCollapsed {
                index: 0,
                collapsed: false,
            },
        )
        .unwrap();
    assert_eq!(book.get_cell("Sheet1", "B1"), Value::Number(4.0));
    assert_eq!(book.list_hidden_rows(0), vec![2]);
}

#[test]
fn ungroup_collapsed_rows_keeps_hidden_and_undo_restores_both_states() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    book.hide_rows(0, &[7]);
    history
        .change_outline(&mut book, 0, Axis::Row, Action::Group { start: 1, end: 3 })
        .unwrap();
    history
        .change_outline(
            &mut book,
            0,
            Axis::Row,
            Action::SetCollapsed {
                index: 0,
                collapsed: true,
            },
        )
        .unwrap();
    history
        .change_outline(
            &mut book,
            0,
            Axis::Row,
            Action::Ungroup { start: 1, end: 3 },
        )
        .unwrap();
    assert!(book.sheet(0).unwrap().outline().rows.is_empty());
    assert_eq!(book.list_hidden_rows(0), vec![1, 2, 3, 7]);
    history.undo(&mut book).unwrap();
    assert!(book.sheet(0).unwrap().outline().rows[0].collapsed);
    assert_eq!(book.list_hidden_rows(0), vec![7]);
    history.redo(&mut book).unwrap();
    history
        .set_visibility(&mut book, 0, area(1, 3), "unhide")
        .unwrap();
    assert_eq!(book.list_hidden_rows(0), vec![7]);
}

#[test]
fn errors_noops_pending_and_foreign_history_do_not_consume_redo() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    history
        .change_outline(
            &mut book,
            0,
            Axis::Column,
            Action::Group { start: 1, end: 3 },
        )
        .unwrap();
    history
        .change_outline(
            &mut book,
            0,
            Axis::Column,
            Action::SetCollapsed {
                index: 0,
                collapsed: true,
            },
        )
        .unwrap();
    history.undo(&mut book).unwrap();
    assert!(!history
        .change_outline(
            &mut book,
            0,
            Axis::Column,
            Action::SetCollapsed {
                index: 0,
                collapsed: false
            }
        )
        .unwrap());
    assert!(history
        .change_outline(
            &mut book,
            0,
            Axis::Column,
            Action::Group { start: 2, end: 4 }
        )
        .is_err());
    assert!(history
        .change_outline(&mut book, 1, Axis::Row, Action::Group { start: 1, end: 3 })
        .is_err());
    history.begin(&book, 0, area(0, 0), "input", true).unwrap();
    assert!(history
        .change_outline(&mut book, 0, Axis::Row, Action::Group { start: 1, end: 3 })
        .is_err());
    history.finish(&mut book, true).unwrap();
    assert_eq!((history.undo_count(), history.redo_count()), (1, 1));
    assert!(history.redo(&mut Workbook::new()).is_err());
    history.redo(&mut book).unwrap();
    book.hide_rows(0, &[10]);
    assert!(history.undo(&mut book).is_err());
    assert_eq!(history.undo_count(), 2);
}

#[test]
fn grouping_large_empty_range_does_not_allocate_cell_atoms() {
    let mut book = Workbook::new();
    let atoms = book.sheet(0).unwrap().debug_total_atom_count();
    let mut history = WorkbookHistory::default();
    history
        .change_outline(
            &mut book,
            0,
            Axis::Row,
            Action::Group {
                start: 0,
                end: 1_048_575,
            },
        )
        .unwrap();
    assert_eq!(book.sheet(0).unwrap().debug_total_atom_count(), atoms);
    history.undo(&mut book).unwrap();
    assert!(book.sheet(0).unwrap().outline().rows.is_empty());
}

#[test]
fn collapsed_cells_are_not_auto_fit_or_chosen_as_quick_formula_destinations() {
    use einfach_excel_core::workbook_quick_formula::QuickFormula;
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Number(1.0));
    book.set_cell(0, "A2", Value::Number(2.0));
    book.sheet_mut(0).unwrap().set_row_height(1, 55);
    let mut history = WorkbookHistory::default();
    history.change_outline(&mut book, 0, Axis::Row, Action::Group { start: 1, end: 2 }).unwrap();
    history.change_outline(&mut book, 0, Axis::Row, Action::SetCollapsed { index: 0, collapsed: true }).unwrap();
    assert!(book.suggest_quick_formula(0, area(0, 1), 100, 8, QuickFormula::Sum).is_err());
    let mut measured = 0;
    book.auto_fit_dimensions(0, area(0, 2), "row", 28, 120, |value, _, _| {
        assert_eq!(value, &Value::Number(1.0));
        measured += 1;
        Ok(30.0)
    }).unwrap();
    assert_eq!(measured, 1);
    assert_eq!(book.sheet(0).unwrap().row_height(1), Some(55));
    history.change_outline(&mut book, 0, Axis::Row, Action::SetCollapsed { index: 0, collapsed: false }).unwrap();
    history.change_outline(&mut book, 0, Axis::Column, Action::Group { start: 0, end: 0 }).unwrap();
    history.change_outline(&mut book, 0, Axis::Column, Action::SetCollapsed { index: 0, collapsed: true }).unwrap();
    assert!(book.suggest_quick_formula(0, area(0, 1), 100, 8, QuickFormula::Sum).is_err());
    book.sheet_mut(0).unwrap().set_col_width(0, 175);
    assert!(!book.auto_fit_dimensions(0, area(0, 2), "column", 28, 120, |_, _, _| {
        panic!("a collapsed column must not be measured")
    }).unwrap());
    assert_eq!(book.sheet(0).unwrap().col_width(0), Some(175));
}
