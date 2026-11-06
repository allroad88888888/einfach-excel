//! 插删行列时浮动对象的锚点与数据引用随动。
use einfach_excel_core::drawings::{DrawingAnchor, DrawingRange, SheetDrawing};
use einfach_excel_core::shift::ShiftEdit;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::Workbook;
use serde_json::json;

fn range(r0: u32, c0: u32, r1: u32, c1: u32) -> DrawingRange {
    DrawingRange {
        start_row: r0,
        start_col: c0,
        end_row: r1,
        end_col: c1,
    }
}

/// 锚点 (row 5, col 3)，偏移 (x 4, y 7)。
fn drawing(id: &str, refs: Vec<Option<DrawingRange>>) -> SheetDrawing {
    SheetDrawing {
        id: id.to_owned(),
        kind: "chart".to_owned(),
        anchor: DrawingAnchor {
            row: 5,
            col: 3,
            offset_x: 4,
            offset_y: 7,
            width: 200,
            height: 100,
        },
        refs,
        payload: json!({ "title": "t" }),
    }
}

/// 在第 0 表放一个对象，执行一次编辑，返回编辑后的对象。
fn after(original: SheetDrawing, edit: ShiftEdit) -> SheetDrawing {
    let mut book = Workbook::new();
    book.sheet_mut(0).unwrap().set_drawing(original).unwrap();
    let mut history = WorkbookHistory::default();
    assert!(history.edit_structure(&mut book, 0, edit).unwrap());
    book.sheet(0).unwrap().drawings()[0].clone()
}

fn anchor_after(edit: ShiftEdit) -> DrawingAnchor {
    after(drawing("a", vec![]), edit).anchor
}

#[test]
fn row_insert_at_or_above_the_anchor_pushes_it_down_and_keeps_the_offset() {
    for at in [0, 5] {
        let anchor = anchor_after(ShiftEdit::RowInsert { at, count: 2 });
        assert_eq!(
            (anchor.row, anchor.offset_y, anchor.col, anchor.offset_x),
            (7, 7, 3, 4)
        );
        assert_eq!((anchor.width, anchor.height), (200, 100));
    }
}

#[test]
fn row_insert_below_the_anchor_leaves_it_alone() {
    let anchor = anchor_after(ShiftEdit::RowInsert { at: 6, count: 3 });
    assert_eq!((anchor.row, anchor.col, anchor.offset_y), (5, 3, 7));
}

#[test]
fn column_insert_moves_only_the_column_axis() {
    let anchor = anchor_after(ShiftEdit::ColInsert { at: 3, count: 3 });
    assert_eq!(
        (anchor.row, anchor.col, anchor.offset_x, anchor.offset_y),
        (5, 6, 4, 7)
    );
    let anchor = anchor_after(ShiftEdit::ColInsert { at: 4, count: 3 });
    assert_eq!(anchor.col, 3);
}

#[test]
fn deleting_rows_above_the_anchor_pulls_it_up() {
    let anchor = anchor_after(ShiftEdit::RowDelete { at: 0, count: 2 });
    assert_eq!((anchor.row, anchor.offset_y), (3, 7));
    let anchor = anchor_after(ShiftEdit::RowDelete { at: 6, count: 2 });
    assert_eq!((anchor.row, anchor.offset_y), (5, 7));
}

#[test]
fn deleting_columns_above_the_anchor_pulls_it_left() {
    let anchor = anchor_after(ShiftEdit::ColDelete { at: 1, count: 2 });
    assert_eq!((anchor.col, anchor.offset_x, anchor.row), (1, 4, 5));
}

#[test]
fn deleting_the_anchor_row_parks_it_on_the_cut_line_and_clears_that_axis_offset() {
    let anchor = anchor_after(ShiftEdit::RowDelete { at: 4, count: 3 });
    assert_eq!((anchor.row, anchor.offset_y), (4, 0));
    assert_eq!((anchor.col, anchor.offset_x), (3, 4));
    assert_eq!((anchor.width, anchor.height), (200, 100));
    let anchor = anchor_after(ShiftEdit::RowDelete { at: 5, count: 1 });
    assert_eq!((anchor.row, anchor.offset_y), (5, 0));
}

#[test]
fn deleting_the_anchor_column_parks_it_on_the_cut_line_and_clears_that_axis_offset() {
    let anchor = anchor_after(ShiftEdit::ColDelete { at: 3, count: 1 });
    assert_eq!((anchor.col, anchor.offset_x), (3, 0));
    assert_eq!((anchor.row, anchor.offset_y), (5, 7));
}

#[test]
fn an_object_pushed_past_the_last_row_stops_on_the_last_row() {
    let mut value = drawing("a", vec![]);
    value.anchor.row = 1_048_575;
    let moved = after(value, ShiftEdit::RowInsert { at: 0, count: 3 });
    assert_eq!(moved.anchor.row, 1_048_575);
}

#[test]
fn insert_shifts_expands_and_leaves_refs_by_position() {
    let refs = vec![Some(range(2, 1, 4, 1)), Some(range(10, 0, 12, 0)), None];
    let moved = after(drawing("a", refs), ShiftEdit::RowInsert { at: 3, count: 2 });
    assert_eq!(
        moved.refs,
        vec![Some(range(2, 1, 6, 1)), Some(range(12, 0, 14, 0)), None]
    );
    let moved = after(
        drawing("a", vec![Some(range(2, 1, 4, 1))]),
        ShiftEdit::RowInsert { at: 0, count: 1 },
    );
    assert_eq!(moved.refs, vec![Some(range(3, 1, 5, 1))]);
}

#[test]
fn column_edits_move_ref_columns_and_never_ref_rows() {
    let value = drawing("a", vec![Some(range(2, 1, 4, 2))]);
    let moved = after(value.clone(), ShiftEdit::ColInsert { at: 0, count: 2 });
    assert_eq!(moved.refs, vec![Some(range(2, 3, 4, 4))]);
    let moved = after(value.clone(), ShiftEdit::ColDelete { at: 1, count: 1 });
    assert_eq!(moved.refs, vec![Some(range(2, 1, 4, 1))]);
    let moved = after(value, ShiftEdit::RowInsert { at: 20, count: 1 });
    assert_eq!(moved.refs, vec![Some(range(2, 1, 4, 2))]);
}

#[test]
fn a_fully_deleted_ref_becomes_none_and_keeps_its_slot() {
    let refs = vec![
        Some(range(2, 1, 4, 1)),
        Some(range(10, 0, 12, 0)),
        Some(range(0, 0, 0, 0)),
    ];
    let moved = after(drawing("a", refs), ShiftEdit::RowDelete { at: 2, count: 3 });
    assert_eq!(
        moved.refs,
        vec![None, Some(range(7, 0, 9, 0)), Some(range(0, 0, 0, 0))]
    );
    let moved = after(
        drawing("a", vec![Some(range(2, 1, 4, 1)), None]),
        ShiftEdit::ColDelete { at: 1, count: 1 },
    );
    assert_eq!(moved.refs, vec![None, None]);
}

#[test]
fn a_partially_deleted_ref_shrinks() {
    let value = drawing("a", vec![Some(range(2, 1, 4, 1))]);
    let moved = after(value.clone(), ShiftEdit::RowDelete { at: 3, count: 5 });
    assert_eq!(moved.refs, vec![Some(range(2, 1, 2, 1))]);
    let moved = after(value.clone(), ShiftEdit::RowDelete { at: 0, count: 3 });
    assert_eq!(moved.refs, vec![Some(range(0, 1, 1, 1))]);
    let moved = after(value, ShiftEdit::RowDelete { at: 3, count: 1 });
    assert_eq!(moved.refs, vec![Some(range(2, 1, 3, 1))]);
}

#[test]
fn identity_and_payload_survive_every_edit() {
    for edit in [
        ShiftEdit::RowInsert { at: 0, count: 1 },
        ShiftEdit::RowDelete { at: 0, count: 6 },
        ShiftEdit::ColInsert { at: 0, count: 1 },
        ShiftEdit::ColDelete { at: 0, count: 4 },
    ] {
        let moved = after(drawing("keep", vec![Some(range(0, 0, 9, 9))]), edit);
        assert_eq!((moved.id.as_str(), moved.kind.as_str()), ("keep", "chart"));
        assert_eq!(moved.payload, json!({ "title": "t" }));
    }
}

#[test]
fn edits_on_one_sheet_do_not_move_objects_on_another() {
    let mut book = Workbook::new();
    let other = book.add_sheet("Other");
    let value = drawing("a", vec![Some(range(2, 1, 4, 1))]);
    book.sheet_mut(0)
        .unwrap()
        .set_drawing(value.clone())
        .unwrap();
    book.sheet_mut(other)
        .unwrap()
        .set_drawing(value.clone())
        .unwrap();
    let mut history = WorkbookHistory::default();
    history
        .edit_structure(&mut book, 0, ShiftEdit::RowInsert { at: 0, count: 4 })
        .unwrap();
    assert_eq!(book.sheet(0).unwrap().drawings()[0].anchor.row, 9);
    assert_eq!(book.sheet(other).unwrap().drawings(), [value]);
}

#[test]
fn every_object_on_the_sheet_moves_in_catalog_order() {
    let mut book = Workbook::new();
    let sheet = book.sheet_mut(0).unwrap();
    for (id, row) in [("a", 1), ("b", 9), ("c", 4)] {
        let mut value = drawing(id, vec![]);
        value.anchor.row = row;
        sheet.set_drawing(value).unwrap();
    }
    let mut history = WorkbookHistory::default();
    history
        .edit_structure(&mut book, 0, ShiftEdit::RowDelete { at: 2, count: 3 })
        .unwrap();
    let rows: Vec<_> = book
        .sheet(0)
        .unwrap()
        .drawings()
        .iter()
        .map(|d| (d.id.as_str(), d.anchor.row))
        .collect();
    assert_eq!(rows, [("a", 1), ("b", 6), ("c", 2)]);
}
