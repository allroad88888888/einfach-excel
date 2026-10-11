//! 名称 CRUD 的历史属于 Rust；失败、无操作与外部修改不能损坏历史栈。
use einfach_core::{Value, ValueError};
use einfach_excel_core::workbook::NamedRangeAction as Action;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, Workbook};

fn range(start: &str, end: &str) -> CellRange {
    CellRange::new(
        CellAddress::parse(start).unwrap(),
        CellAddress::parse(end).unwrap(),
    )
}
fn create(name: &str) -> Action {
    Action::Create {
        name: name.into(),
        sheet: 0,
        range: range("A1", "A2"),
    }
}
fn seed() -> Workbook {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(10.0));
    wb.set_cell(0, "A2", Value::Number(20.0));
    wb.set_cell(0, "A5", Value::Number(50.0));
    assert!(wb.set_formula(0, "C1", "=SUM(Sales)"));
    wb
}

#[test]
fn create_update_delete_each_undo_and_redo_one_native_entry() {
    let mut wb = seed();
    let mut history = WorkbookHistory::default();
    assert_eq!(
        wb.get_cell("Sheet1", "C1"),
        Value::Error(ValueError::InvalidName)
    );
    assert!(history
        .change_named_range(&mut wb, 0, create("Sales"))
        .unwrap());
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(30.0));
    history
        .change_named_range(
            &mut wb,
            0,
            Action::Update {
                name: "sales".into(),
                new_name: "Sales".into(),
                target: Some((0, range("A5", "A5"))),
            },
        )
        .unwrap();
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(50.0));
    history
        .change_named_range(
            &mut wb,
            0,
            Action::Delete {
                name: "SALES".into(),
            },
        )
        .unwrap();
    assert_eq!(history.undo_count(), 3);
    for _ in 0..3 {
        assert_eq!(
            wb.get_cell("Sheet1", "C1"),
            Value::Error(ValueError::InvalidName)
        );
        history.undo(&mut wb).unwrap();
        assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(50.0));
        history.undo(&mut wb).unwrap();
        assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(30.0));
        history.undo(&mut wb).unwrap();
        assert_eq!(
            wb.get_cell("Sheet1", "C1"),
            Value::Error(ValueError::InvalidName)
        );
        for _ in 0..3 {
            history.redo(&mut wb).unwrap();
        }
    }
}

#[test]
fn failed_and_unchanged_commands_preserve_redo_and_other_names() {
    let mut wb = seed();
    wb.define_name_value("Taken", Value::Number(7.0)).unwrap();
    let mut history = WorkbookHistory::default();
    history
        .change_named_range(&mut wb, 0, create("Sales"))
        .unwrap();
    history
        .change_named_range(&mut wb, 0, create("Future"))
        .unwrap();
    history.undo(&mut wb).unwrap();
    for action in [
        create("sales"),
        create("Taken"),
        create("SUM"),
        create("bad name"),
        Action::Create {
            name: "Invalid".into(),
            sheet: 99,
            range: range("A1", "A2"),
        },
        Action::Update {
            name: "Sales".into(),
            new_name: "Taken".into(),
            target: None,
        },
        Action::Delete {
            name: "Taken".into(),
        },
        Action::Delete {
            name: "Missing".into(),
        },
    ] {
        assert!(history.change_named_range(&mut wb, 0, action).is_err());
        assert_eq!(history.redo_count(), 1);
        assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(30.0));
    }
    assert!(!history
        .change_named_range(
            &mut wb,
            0,
            Action::Update {
                name: "sales".into(),
                new_name: "Sales".into(),
                target: Some((0, range("A1", "A2"))),
            }
        )
        .unwrap());
    assert_eq!(history.redo_count(), 1);
    history.redo(&mut wb).unwrap();
    assert!(wb.named_range("Future").unwrap().is_some());
    assert_eq!(wb.get_named("Taken"), Some(Value::Number(7.0)));
}

#[test]
fn pending_history_foreign_workbooks_and_external_changes_reject_before_writing() {
    let mut wb = seed();
    let mut history = WorkbookHistory::default();
    history
        .begin(&wb, 0, range("A1", "A1"), "Pending edit", true)
        .unwrap();
    assert!(history
        .change_named_range(&mut wb, 0, create("Sales"))
        .is_err());
    history.finish(&mut wb, true).unwrap();
    history
        .change_named_range(&mut wb, 0, create("Sales"))
        .unwrap();
    let mut foreign = seed();
    assert!(history.undo(&mut foreign).is_err());
    assert!(foreign.named_names().next().is_none());
    wb.define_named_range("Sales", 0, range("A5", "A5"))
        .unwrap();
    assert!(history.undo(&mut wb).is_err());
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(50.0));
    assert_eq!(history.undo_count(), 1);
}

#[test]
fn one_entry_never_copies_cells_or_restores_unrelated_names() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    let before = wb.sheet(0).unwrap().debug_materialized_cell_atom_count();
    history
        .change_named_range(
            &mut wb,
            0,
            Action::Create {
                name: "Sales".into(),
                sheet: 0,
                range: range("A1", "A1048576"),
            },
        )
        .unwrap();
    wb.define_name_value("Unrelated", Value::Number(99.0))
        .unwrap();
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.get_named("Unrelated"), Some(Value::Number(99.0)));
    history.redo(&mut wb).unwrap();
    assert_eq!(
        wb.sheet(0).unwrap().debug_materialized_cell_atom_count(),
        before
    );
}

#[test]
fn target_update_publishes_only_one_final_change_to_subscribers() {
    use std::{cell::Cell, rc::Rc};
    let mut wb = seed();
    let mut history = WorkbookHistory::default();
    history
        .change_named_range(&mut wb, 0, create("Sales"))
        .unwrap();
    let hits = Rc::new(Cell::new(0));
    let seen = hits.clone();
    let subscription = wb
        .sheet_mut(0)
        .unwrap()
        .subscribe_cell("C1", move || seen.set(seen.get() + 1));
    hits.set(0);
    history
        .change_named_range(
            &mut wb,
            0,
            Action::Update {
                name: "Sales".into(),
                new_name: "Sales".into(),
                target: Some((0, range("A5", "A5"))),
            },
        )
        .unwrap();
    assert_eq!(hits.replace(0), 1);
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(50.0));
    history.undo(&mut wb).unwrap();
    assert_eq!(hits.get(), 1);
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(30.0));
    wb.sheet_mut(0).unwrap().unsubscribe_cell(subscription);
}
