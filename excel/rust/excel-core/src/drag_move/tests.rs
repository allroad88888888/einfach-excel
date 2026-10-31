use super::*;
use crate::protection::ProtectionChange;
use crate::workbook::MergeAction;

fn addr(text: &str) -> CellAddress {
    CellAddress::parse(text).unwrap()
}
fn range(start: &str, end: &str) -> CellRange {
    CellRange::new(addr(start), addr(end))
}
fn transfer(source: CellRange, target: &str, copy: bool, replace: bool) -> DragTransfer {
    DragTransfer {
        source,
        target: addr(target),
        copy,
        replace,
        row_count: crate::sheet::EXCEL_MAX_ROWS,
        col_count: crate::sheet::EXCEL_MAX_COLS,
    }
}
fn workbook() -> Workbook {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(2.0));
    wb.set_cell(0, "A2", Value::Number(3.0));
    wb.set_formula(0, "B1", "=A1*10");
    wb.set_formula(0, "D1", "=SUM(A1:A2)");
    wb
}
fn value(wb: &Workbook, cell: &str) -> Value {
    wb.sheet(0).unwrap().get_cell(cell)
}
fn formula(wb: &Workbook, cell: &str) -> Option<String> {
    wb.sheet(0).unwrap().get_formula(cell)
}

#[test]
fn move_follows_references_and_undoes_in_one_step() {
    let mut wb = workbook();
    let mut history = WorkbookHistory::default();
    let moved = wb
        .drag_transfer(0, &transfer(range("A1", "A2"), "F5", false, false), Some(&mut history))
        .unwrap();
    assert_eq!(moved, range("F5", "F6"));
    assert_eq!(value(&wb, "A1"), Value::Null);
    assert_eq!(value(&wb, "F5"), Value::Number(2.0));
    assert_eq!(formula(&wb, "B1").as_deref(), Some("=(F5*10)"));
    assert_eq!(formula(&wb, "D1").as_deref(), Some("=SUM(F5:F6)"));
    assert_eq!(value(&wb, "D1"), Value::Number(5.0));
    assert_eq!(history.undo_count(), 1);
    assert!(history.undo(&mut wb).unwrap());
    assert_eq!(value(&wb, "A1"), Value::Number(2.0));
    assert_eq!(value(&wb, "F5"), Value::Null);
    assert_eq!(formula(&wb, "D1").as_deref(), Some("=SUM(A1:A2)"));
}

#[test]
fn copy_keeps_source_and_shifts_relative_references() {
    let mut wb = workbook();
    wb.drag_transfer(0, &transfer(range("A1", "B1"), "A5", true, false), None)
        .unwrap();
    assert_eq!(value(&wb, "A1"), Value::Number(2.0));
    assert_eq!(value(&wb, "A5"), Value::Number(2.0));
    assert_eq!(formula(&wb, "B5").as_deref(), Some("=(A5*10)"));
    assert_eq!(value(&wb, "B5"), Value::Number(20.0));
}

#[test]
fn occupied_destination_requires_confirmation() {
    let mut wb = workbook();
    wb.set_cell(0, "C2", Value::Text("keep".into()));
    let blocked = wb.drag_transfer(0, &transfer(range("A1", "A2"), "C1", false, false), None);
    assert_eq!(blocked, Err(DRAG_TARGET_NOT_EMPTY));
    assert_eq!(value(&wb, "A1"), Value::Number(2.0));
    wb.drag_transfer(0, &transfer(range("A1", "A2"), "C1", false, true), None)
        .unwrap();
    assert_eq!(value(&wb, "C2"), Value::Number(3.0));
}

#[test]
fn moving_over_its_own_cells_is_not_occupied_but_copying_is() {
    let mut wb = workbook();
    let source = range("A1", "A2");
    assert_eq!(
        wb.drag_transfer(0, &transfer(source, "A2", true, false), None),
        Err(DRAG_TARGET_NOT_EMPTY)
    );
    wb.drag_transfer(0, &transfer(source, "A2", false, false), None)
        .unwrap();
    assert_eq!(value(&wb, "A1"), Value::Null);
    assert_eq!(value(&wb, "A2"), Value::Number(2.0));
    assert_eq!(value(&wb, "A3"), Value::Number(3.0));
}

#[test]
fn rejects_unchanged_outside_locked_and_partial_merge_drops() {
    let mut wb = workbook();
    let source = range("A1", "A2");
    assert_eq!(
        wb.drag_transfer(0, &transfer(source, "A1", false, false), None),
        Err(DRAG_TARGET_UNCHANGED)
    );
    let mut outside = transfer(source, "A10", false, false);
    outside.row_count = 10;
    assert_eq!(wb.drag_transfer(0, &outside, None), Err("CLIPBOARD_OUTSIDE_SHEET"));
    wb.merge_cells(0, range("A2", "B2"), MergeAction::Merge, true).unwrap();
    assert_eq!(
        wb.drag_transfer(0, &transfer(source, "F1", false, false), None),
        Err("CLIPBOARD_PARTIAL_MERGE")
    );
    let mut locked = workbook();
    locked.change_protection(0, ProtectionChange::Protect).unwrap();
    assert!(locked
        .drag_transfer(0, &transfer(source, "F1", false, false), None)
        .is_err());
    assert_eq!(value(&locked, "A1"), Value::Number(2.0));
}
