//! 图表数据可以引用别的工作表：规范化、结构平移、撤销重做与删表。
use einfach_excel_core::drawings::{DrawingAnchor, DrawingRange, SheetDrawing};
use einfach_excel_core::shift::ShiftEdit;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::Workbook;
use serde_json::json;

fn range(r0: u32, r1: u32, sheet: Option<u64>) -> DrawingRange {
    DrawingRange {
        start_row: r0,
        start_col: 0,
        end_row: r1,
        end_col: 1,
        sheet,
    }
}

fn chart(refs: Vec<Option<DrawingRange>>) -> SheetDrawing {
    SheetDrawing {
        id: "c".to_owned(),
        kind: "chart".to_owned(),
        anchor: DrawingAnchor {
            row: 5,
            col: 3,
            offset_x: 0,
            offset_y: 0,
            width: 200,
            height: 100,
        },
        refs,
        payload: json!({}),
    }
}

/// 表 0 = Sheet1（放图表），表 1 = Data；返回 Data 的 key。
fn setup(refs: impl Fn(u64) -> Vec<Option<DrawingRange>>) -> (Workbook, WorkbookHistory, u64) {
    let mut book = Workbook::new();
    book.add_sheet("Data");
    let key = book.sheet_key(1).unwrap();
    let mut history = WorkbookHistory::default();
    history.set_drawing(&mut book, 0, chart(refs(key))).unwrap();
    (book, history, key)
}

fn refs_of(book: &Workbook, sheet: usize) -> Vec<Option<DrawingRange>> {
    book.sheet(sheet).unwrap().drawings()[0].refs.clone()
}

#[test]
fn set_normalizes_the_own_key_and_rejects_unknown_keys() {
    let mut book = Workbook::new();
    book.add_sheet("Data");
    let own = book.sheet_key(0).unwrap();
    let mut history = WorkbookHistory::default();
    history
        .set_drawing(&mut book, 0, chart(vec![Some(range(0, 3, Some(own)))]))
        .unwrap();
    assert_eq!(refs_of(&book, 0), vec![Some(range(0, 3, None))]);
    let bad = chart(vec![Some(range(0, 3, Some(u64::MAX)))]);
    assert_eq!(
        history.set_drawing(&mut book, 0, bad),
        Err("The object data worksheet does not exist.")
    );
    assert_eq!(refs_of(&book, 0), vec![Some(range(0, 3, None))]);
}

#[test]
fn editing_the_data_sheet_shifts_cross_sheet_refs_only() {
    let (mut book, mut history, key) =
        setup(|key| vec![Some(range(2, 4, Some(key))), Some(range(2, 4, None))]);
    history
        .edit_structure(&mut book, 1, ShiftEdit::RowInsert { at: 0, count: 3 })
        .unwrap();
    assert_eq!(
        refs_of(&book, 0),
        vec![Some(range(5, 7, Some(key))), Some(range(2, 4, None))]
    );
    assert_eq!(book.sheet(0).unwrap().drawings()[0].anchor.row, 5);
}

#[test]
fn editing_the_object_sheet_leaves_cross_sheet_refs_alone() {
    let (mut book, mut history, key) =
        setup(|key| vec![Some(range(2, 4, Some(key))), Some(range(2, 4, None))]);
    history
        .edit_structure(&mut book, 0, ShiftEdit::RowInsert { at: 0, count: 3 })
        .unwrap();
    assert_eq!(
        refs_of(&book, 0),
        vec![Some(range(2, 4, Some(key))), Some(range(5, 7, None))]
    );
    assert_eq!(book.sheet(0).unwrap().drawings()[0].anchor.row, 8);
}

#[test]
fn deleting_all_referenced_rows_turns_the_ref_into_none() {
    let (mut book, mut history, _) = setup(|key| vec![Some(range(2, 4, Some(key)))]);
    history
        .edit_structure(&mut book, 1, ShiftEdit::RowDelete { at: 1, count: 5 })
        .unwrap();
    assert_eq!(refs_of(&book, 0), vec![None]);
}

#[test]
fn structural_undo_and_redo_restore_the_other_sheets_objects() {
    let (mut book, mut history, key) = setup(|key| vec![Some(range(2, 4, Some(key)))]);
    history
        .edit_structure(&mut book, 1, ShiftEdit::RowDelete { at: 1, count: 5 })
        .unwrap();
    assert_eq!(refs_of(&book, 0), vec![None]);
    history.undo(&mut book).unwrap();
    assert_eq!(refs_of(&book, 0), vec![Some(range(2, 4, Some(key)))]);
    history.redo(&mut book).unwrap();
    assert_eq!(refs_of(&book, 0), vec![None]);
    history.undo(&mut book).unwrap();
    history
        .edit_structure(&mut book, 1, ShiftEdit::ColInsert { at: 0, count: 1 })
        .unwrap();
    history.undo(&mut book).unwrap();
    assert_eq!(refs_of(&book, 0), vec![Some(range(2, 4, Some(key)))]);
}

#[test]
fn deleting_the_data_sheet_keeps_the_key_and_undo_makes_it_valid_again() {
    let (mut book, mut history, key) = setup(|key| vec![Some(range(2, 4, Some(key)))]);
    history.remove_sheet(&mut book, 1).unwrap();
    assert_eq!(refs_of(&book, 0), vec![Some(range(2, 4, Some(key)))]);
    history.undo(&mut book).unwrap();
    assert_eq!(book.sheet_key(1), Some(key));
    assert_eq!(refs_of(&book, 0), vec![Some(range(2, 4, Some(key)))]);
    history
        .edit_structure(&mut book, 1, ShiftEdit::RowInsert { at: 0, count: 1 })
        .unwrap();
    assert_eq!(refs_of(&book, 0), vec![Some(range(3, 5, Some(key)))]);
}

#[test]
fn renaming_the_data_sheet_keeps_the_reference() {
    let (mut book, _history, key) = setup(|key| vec![Some(range(2, 4, Some(key)))]);
    assert!(book.rename_sheet(1, "Numbers"));
    assert_eq!(refs_of(&book, 0), vec![Some(range(2, 4, Some(key)))]);
}

#[test]
fn a_duplicated_sheet_keeps_own_sheet_refs_pointing_at_itself() {
    let (mut book, mut history, key) =
        setup(|key| vec![Some(range(2, 4, None)), Some(range(0, 1, Some(key)))]);
    let copy = history.duplicate_sheet(&mut book, 0).unwrap();
    assert_eq!(
        refs_of(&book, copy),
        vec![Some(range(2, 4, None)), Some(range(0, 1, Some(key)))]
    );
}
