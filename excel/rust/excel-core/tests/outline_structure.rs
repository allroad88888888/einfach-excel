//! 插删行列、工作表移动与归档不能丢失原生大纲。
use einfach_core::Value;
use einfach_excel_core::outline::{OutlineAction as Action, OutlineAxis as Axis};
use einfach_excel_core::shift::ShiftEdit;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::Workbook;

#[test]
fn row_and_column_groups_shift_shrink_disappear_and_restore_with_history() {
    for axis in [Axis::Row, Axis::Column] {
        let mut book = Workbook::new();
        let mut history = WorkbookHistory::default();
        history
            .change_outline(&mut book, 0, axis, Action::Group { start: 2, end: 7 })
            .unwrap();
        history
            .change_outline(&mut book, 0, axis, Action::Group { start: 4, end: 5 })
            .unwrap();
        history
            .change_outline(
                &mut book,
                0,
                axis,
                Action::SetCollapsed {
                    index: 0,
                    collapsed: true,
                },
            )
            .unwrap();
        let before = book.sheet(0).unwrap().outline().clone();
        let insert = if axis == Axis::Row {
            ShiftEdit::RowInsert { at: 3, count: 2 }
        } else {
            ShiftEdit::ColInsert { at: 3, count: 2 }
        };
        history.edit_structure(&mut book, 0, insert).unwrap();
        let shifted = book.sheet(0).unwrap().outline().clone();
        assert_eq!(
            shifted
                .groups(axis)
                .iter()
                .map(|g| (g.start, g.end))
                .collect::<Vec<_>>(),
            vec![(2, 9), (6, 7)]
        );
        let delete = if axis == Axis::Row {
            ShiftEdit::RowDelete { at: 5, count: 4 }
        } else {
            ShiftEdit::ColDelete { at: 5, count: 4 }
        };
        history.edit_structure(&mut book, 0, delete).unwrap();
        let groups = book.sheet(0).unwrap().outline().groups(axis);
        assert_eq!(groups.len(), 1);
        assert_eq!(
            (groups[0].start, groups[0].end, groups[0].collapsed),
            (2, 5, true)
        );
        history.undo(&mut book).unwrap();
        assert_eq!(book.sheet(0).unwrap().outline(), &shifted);
        history.undo(&mut book).unwrap();
        assert_eq!(book.sheet(0).unwrap().outline(), &before);
        history.redo(&mut book).unwrap();
        history.redo(&mut book).unwrap();
        assert_eq!(book.sheet(0).unwrap().outline().groups(axis).len(), 1);
    }
}

#[test]
fn insertion_at_start_moves_group_and_overflow_is_rejected_before_any_write() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    history
        .change_outline(&mut book, 0, Axis::Row, Action::Group { start: 2, end: 4 })
        .unwrap();
    history
        .edit_structure(&mut book, 0, ShiftEdit::RowInsert { at: 2, count: 1 })
        .unwrap();
    assert_eq!(book.sheet(0).unwrap().outline().rows[0].start, 3);
    history
        .change_outline(
            &mut book,
            0,
            Axis::Row,
            Action::Group {
                start: 1_048_575,
                end: 1_048_575,
            },
        )
        .unwrap();
    let before = book.sheet(0).unwrap().outline().clone();
    let count = history.undo_count();
    assert!(history
        .edit_structure(&mut book, 0, ShiftEdit::RowInsert { at: 0, count: 1 })
        .is_err());
    assert_eq!(book.sheet(0).unwrap().outline(), &before);
    assert_eq!(history.undo_count(), count);
}

#[test]
fn topology_history_preserves_both_axes_and_filter_remains_independent() {
    let mut book = Workbook::new();
    book.add_sheet("Second");
    let mut history = WorkbookHistory::default();
    for axis in [Axis::Row, Axis::Column] {
        history
            .change_outline(&mut book, 0, axis, Action::Group { start: 1, end: 3 })
            .unwrap();
        history
            .change_outline(
                &mut book,
                0,
                axis,
                Action::SetCollapsed {
                    index: 0,
                    collapsed: true,
                },
            )
            .unwrap();
    }
    let outline = book.sheet(0).unwrap().outline().clone();
    history.move_sheet(&mut book, 0, 1).unwrap();
    history.remove_sheet(&mut book, 1).unwrap();
    history.undo(&mut book).unwrap();
    assert_eq!(book.sheet(1).unwrap().outline(), &outline);
    history.undo(&mut book).unwrap();
    assert_eq!(book.sheet(0).unwrap().outline(), &outline);
    assert!(book.sheet(1).unwrap().outline().rows.is_empty());
    book.set_eval_filter_hidden_rows(0, &[2]);
    for row in 1..=5 {
        book.set_cell(0, &format!("A{row}"), Value::Number(1.0));
    }
    book.set_formula(0, "B1", "=SUBTOTAL(109,A1:A5)");
    book.set_formula(0, "B2", "=SUBTOTAL(9,A1:A5)");
    assert_eq!(book.get_cell("Sheet1", "B1"), Value::Number(2.0));
    assert_eq!(book.get_cell("Sheet1", "B2"), Value::Number(4.0));
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
    assert_eq!(book.filter_hidden_rows(0), vec![2]);
}

#[test]
fn structural_history_republishes_collapsed_visibility_to_formula_dependencies() {
    let mut book = Workbook::new();
    for row in 1..=6 {
        book.set_cell(0, &format!("A{row}"), Value::Number(1.0));
    }
    book.set_formula(0, "B1", "=SUBTOTAL(109,A1:A6)");
    let mut history = WorkbookHistory::default();
    history
        .change_outline(&mut book, 0, Axis::Row, Action::Group { start: 2, end: 4 })
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
    assert_eq!(book.get_cell("Sheet1", "B1"), Value::Number(3.0));
    history
        .edit_structure(&mut book, 0, ShiftEdit::RowDelete { at: 1, count: 4 })
        .unwrap();
    assert!(book.sheet(0).unwrap().outline().rows.is_empty());
    assert_eq!(book.get_cell("Sheet1", "B1"), Value::Number(2.0));
    history.undo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "B1"), Value::Number(3.0));
    history.redo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "B1"), Value::Number(2.0));
}
