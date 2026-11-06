//! 浮动对象的撤销重做：新增 / 修改 / 移动 / 删除 / 置顶置底、结构编辑回放与复制工作表。
use einfach_excel_core::drawings::{DrawingAnchor, DrawingRange, SheetDrawing};
use einfach_excel_core::protection::ProtectionChange;
use einfach_excel_core::shift::ShiftEdit;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::Workbook;
use serde_json::json;

fn drawing(id: &str) -> SheetDrawing {
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
        refs: vec![Some(DrawingRange {
            start_row: 2,
            start_col: 1,
            end_row: 4,
            end_col: 1,
        })],
        payload: json!({ "title": "t" }),
    }
}

fn catalog(book: &Workbook, sheet: usize) -> Vec<SheetDrawing> {
    book.sheet(sheet).unwrap().drawings().to_vec()
}

fn ids(book: &Workbook) -> Vec<String> {
    catalog(book, 0).into_iter().map(|d| d.id).collect()
}

fn setup(names: &[&str]) -> (Workbook, WorkbookHistory) {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    for name in names {
        history.set_drawing(&mut book, 0, drawing(name)).unwrap();
    }
    (book, history)
}

fn last_label(history: &WorkbookHistory) -> String {
    history.entries().last().unwrap().label.clone()
}

#[test]
fn set_drawing_is_one_undoable_step_that_redo_restores_exactly() {
    let (mut book, mut history) = setup(&[]);
    assert_eq!(history.set_drawing(&mut book, 0, drawing("a")), Ok(true));
    assert_eq!(
        (history.undo_count(), last_label(&history).as_str()),
        (1, "Insert object")
    );
    assert_eq!(history.undo(&mut book), Ok(true));
    assert!(catalog(&book, 0).is_empty());
    assert_eq!(history.redo(&mut book), Ok(true));
    assert_eq!(catalog(&book, 0), [drawing("a")]);
}

#[test]
fn undo_selects_the_anchor_cell_of_the_object() {
    let (_, history) = setup(&["a"]);
    let range = history.entries().next().unwrap().range;
    assert_eq!((range.start.row, range.start.col), (5, 3));
    assert_eq!(range.start, range.end);
}

#[test]
fn setting_an_identical_drawing_adds_no_history() {
    let (mut book, mut history) = setup(&["a"]);
    assert_eq!(history.set_drawing(&mut book, 0, drawing("a")), Ok(false));
    assert_eq!(history.undo_count(), 1);
}

#[test]
fn an_invalid_drawing_adds_no_history_and_changes_nothing() {
    let (mut book, mut history) = setup(&["a"]);
    let mut bad = drawing("b");
    bad.kind = "BAD".into();
    assert!(history.set_drawing(&mut book, 0, bad).is_err());
    assert_eq!(
        (history.undo_count(), ids(&book)),
        (1, vec!["a".to_owned()])
    );
    assert!(history.set_drawing(&mut book, 9, drawing("z")).is_err());
}

#[test]
fn move_resize_and_edit_replace_in_place_and_undo_to_the_previous_version() {
    let (mut book, mut history) = setup(&["a", "b"]);
    let mut moved = drawing("a");
    moved.anchor.row = 20;
    let mut resized = moved.clone();
    resized.anchor.width = 300;
    let mut edited = resized.clone();
    edited.payload = json!({ "title": "new" });
    let mut steps = Vec::new();
    for next in [moved, resized, edited] {
        assert_eq!(history.set_drawing(&mut book, 0, next), Ok(true));
        steps.push(last_label(&history));
    }
    assert_eq!(steps, ["Move object", "Resize object", "Edit object"]);
    assert_eq!(ids(&book), ["a", "b"]);
    for width in [300, 200, 200] {
        history.undo(&mut book).unwrap();
        assert_eq!(catalog(&book, 0)[0].anchor.width, width);
    }
    assert_eq!(catalog(&book, 0), [drawing("a"), drawing("b")]);
    history.redo(&mut book).unwrap();
    assert_eq!(catalog(&book, 0)[0].anchor.row, 20);
}

#[test]
fn remove_drawing_undo_puts_it_back_at_its_original_layer() {
    let (mut book, mut history) = setup(&["a", "b", "c"]);
    assert_eq!(history.remove_drawing(&mut book, 0, "b"), Ok(true));
    assert_eq!(last_label(&history), "Delete object");
    assert_eq!(ids(&book), ["a", "c"]);
    history.undo(&mut book).unwrap();
    assert_eq!(ids(&book), ["a", "b", "c"]);
    history.redo(&mut book).unwrap();
    assert_eq!(ids(&book), ["a", "c"]);
}

#[test]
fn removing_a_missing_object_is_a_silent_no_op() {
    let (mut book, mut history) = setup(&["a"]);
    assert_eq!(history.remove_drawing(&mut book, 0, "nope"), Ok(false));
    assert_eq!(history.undo_count(), 1);
}

#[test]
fn reorder_is_undoable_and_redoable_in_both_directions() {
    let (mut book, mut history) = setup(&["a", "b", "c"]);
    assert_eq!(history.reorder_drawing(&mut book, 0, "a", true), Ok(true));
    assert_eq!(last_label(&history), "Bring object to front");
    assert_eq!(history.reorder_drawing(&mut book, 0, "c", false), Ok(true));
    assert_eq!(last_label(&history), "Send object to back");
    assert_eq!(ids(&book), ["c", "b", "a"]);
    history.undo(&mut book).unwrap();
    assert_eq!(ids(&book), ["b", "c", "a"]);
    history.undo(&mut book).unwrap();
    assert_eq!(ids(&book), ["a", "b", "c"]);
    history.redo(&mut book).unwrap();
    history.redo(&mut book).unwrap();
    assert_eq!(ids(&book), ["c", "b", "a"]);
}

#[test]
fn reorder_that_changes_nothing_adds_no_history() {
    let (mut book, mut history) = setup(&["a", "b"]);
    assert_eq!(history.reorder_drawing(&mut book, 0, "b", true), Ok(false));
    assert_eq!(history.reorder_drawing(&mut book, 0, "a", false), Ok(false));
    assert_eq!(
        history.reorder_drawing(&mut book, 0, "zzz", true),
        Ok(false)
    );
    assert_eq!(history.undo_count(), 2);
}

#[test]
fn a_new_edit_after_undo_discards_the_redo_branch() {
    let (mut book, mut history) = setup(&["a"]);
    history.undo(&mut book).unwrap();
    assert_eq!(history.redo_count(), 1);
    history.set_drawing(&mut book, 0, drawing("b")).unwrap();
    assert_eq!(history.redo_count(), 0);
    assert_eq!(ids(&book), ["b"]);
}

#[test]
fn undo_refuses_when_the_catalog_changed_outside_history() {
    let (mut book, mut history) = setup(&["a"]);
    book.sheet_mut(0).unwrap().remove_drawing("a");
    assert!(history.undo(&mut book).is_err());
    assert!(catalog(&book, 0).is_empty());
}

#[test]
fn a_protected_sheet_rejects_every_object_command() {
    let (mut book, mut history) = setup(&["a", "b"]);
    book.change_protection(0, ProtectionChange::Protect)
        .unwrap();
    assert!(history.set_drawing(&mut book, 0, drawing("c")).is_err());
    assert!(history.remove_drawing(&mut book, 0, "a").is_err());
    assert!(history.reorder_drawing(&mut book, 0, "a", true).is_err());
    assert!(history.undo(&mut book).is_err());
    assert_eq!(
        (ids(&book), history.undo_count()),
        (vec!["a".to_owned(), "b".to_owned()], 2)
    );
}

#[test]
fn objects_on_different_sheets_have_independent_histories() {
    let (mut book, mut history) = setup(&["a"]);
    let other = book.add_sheet("Other");
    history.set_drawing(&mut book, other, drawing("a")).unwrap();
    history.undo(&mut book).unwrap();
    assert!(catalog(&book, other).is_empty());
    assert_eq!(ids(&book), ["a"]);
}

#[test]
fn structural_edits_undo_and_redo_the_drawing_catalog() {
    for edit in [
        ShiftEdit::RowInsert { at: 1, count: 2 },
        ShiftEdit::RowDelete { at: 3, count: 4 },
        ShiftEdit::ColInsert { at: 0, count: 2 },
        ShiftEdit::ColDelete { at: 1, count: 3 },
    ] {
        let (mut book, mut history) = setup(&["a", "b"]);
        let original = catalog(&book, 0);
        assert!(history.edit_structure(&mut book, 0, edit).unwrap());
        let shifted = catalog(&book, 0);
        assert_ne!(shifted, original, "{edit:?}");
        for _ in 0..2 {
            history.undo(&mut book).unwrap();
            assert_eq!(catalog(&book, 0), original, "{edit:?}");
            history.redo(&mut book).unwrap();
            assert_eq!(catalog(&book, 0), shifted, "{edit:?}");
        }
    }
}

#[test]
fn undoing_a_row_delete_restores_a_ref_that_had_been_deleted_to_none() {
    let (mut book, mut history) = setup(&["a"]);
    history
        .edit_structure(&mut book, 0, ShiftEdit::RowDelete { at: 2, count: 4 })
        .unwrap();
    let deleted = catalog(&book, 0)[0].clone();
    assert_eq!(deleted.refs, [None]);
    assert_eq!((deleted.anchor.row, deleted.anchor.offset_y), (2, 0));
    history.undo(&mut book).unwrap();
    assert_eq!(catalog(&book, 0), [drawing("a")]);
}

#[test]
fn drawing_edits_after_a_structural_edit_undo_in_stack_order() {
    let (mut book, mut history) = setup(&["a"]);
    history
        .edit_structure(&mut book, 0, ShiftEdit::RowInsert { at: 0, count: 1 })
        .unwrap();
    let mut moved = catalog(&book, 0)[0].clone();
    moved.anchor.col = 9;
    history.set_drawing(&mut book, 0, moved).unwrap();
    history.undo(&mut book).unwrap();
    assert_eq!(catalog(&book, 0)[0].anchor.row, 6);
    history.undo(&mut book).unwrap();
    assert_eq!(catalog(&book, 0), [drawing("a")]);
}

#[test]
fn duplicate_sheet_copies_every_object_independently() {
    let (mut book, mut history) = setup(&["a", "b"]);
    let copy = history.duplicate_sheet(&mut book, 0).unwrap();
    assert_eq!(copy, 1);
    assert_eq!(catalog(&book, copy), catalog(&book, 0));
    history
        .set_drawing(&mut book, copy, drawing("only-copy"))
        .unwrap();
    book.sheet_mut(copy).unwrap().remove_drawing("a");
    assert_eq!(ids(&book), ["a", "b"]);
    assert_eq!(catalog(&book, copy).len(), 2);
}

#[test]
fn duplicate_sheet_undo_and_redo_keep_the_copied_objects() {
    let (mut book, mut history) = setup(&["a", "b"]);
    let original = catalog(&book, 0);
    history.duplicate_sheet(&mut book, 0).unwrap();
    history.undo(&mut book).unwrap();
    assert_eq!(book.sheet_count(), 1);
    history.redo(&mut book).unwrap();
    assert_eq!(book.sheet_count(), 2);
    assert_eq!(catalog(&book, 1), original);
    assert_eq!(catalog(&book, 0), original);
}

#[test]
fn duplicating_a_sheet_without_objects_stays_empty() {
    let (mut book, mut history) = setup(&[]);
    history.duplicate_sheet(&mut book, 0).unwrap();
    assert!(catalog(&book, 1).is_empty());
}
