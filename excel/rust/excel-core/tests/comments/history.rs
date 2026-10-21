use einfach_core::Value;
use einfach_excel_core::{CellAddress, CellFormat, Workbook};
use einfach_excel_core::comments::{CommentEntryKind, NativeCommentChange};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::shift::ShiftEdit;

fn addr(text: &str) -> CellAddress { CellAddress::parse(text).unwrap() }
fn create() -> NativeCommentChange {
    NativeCommentChange::Create { author: " Alice ".into(), body: "first\r\n第二行🙂".into() }
}

#[test]
fn create_reply_resolve_reopen_undo_preserves_full_authored_history() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    book.set_formula(0, "A1", "=1+2");
    book.set_cell_input(0, "B1", "neighbor").unwrap();
    book.sheet_mut(0).unwrap().set_format("A1", CellFormat { bold: true, ..Default::default() });
    let changes = vec![create(),
        NativeCommentChange::Reply { author: "Bob".into(), body: "<img src=x onerror=bad()>".into() },
        NativeCommentChange::Resolve { author: "Carol".into() },
        NativeCommentChange::Reopen { author: "Dave".into() }];
    for (index, change) in changes.into_iter().enumerate() {
        let before = book.sheet(0).unwrap().comment(addr("A1")).cloned();
        assert!(history.change_comment(&mut book, 0, addr("A1"), change, 1000 + index as i64).unwrap());
        let after = book.sheet(0).unwrap().comment(addr("A1")).cloned();
        assert_eq!(history.undo_count(), index + 1);
        history.undo(&mut book).unwrap();
        assert_eq!(book.sheet(0).unwrap().comment(addr("A1")), before.as_ref());
        history.redo(&mut book).unwrap();
        assert_eq!(book.sheet(0).unwrap().comment(addr("A1")), after.as_ref());
        assert_eq!(book.sheet(0).unwrap().get_formula("A1").as_deref(), Some("=1+2"));
        assert!(book.sheet(0).unwrap().effective_format("A1").bold);
        assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(3.0));
        assert_eq!(book.get_cell("Sheet1", "B1"), Value::Text("neighbor".into()));
    }
    let thread = book.sheet(0).unwrap().comment(addr("A1")).unwrap();
    assert!(!thread.resolved);
    assert_eq!(thread.entries.len(), 4);
    assert_eq!(thread.entries[0].author, "Alice");
    assert_eq!(thread.entries[0].body.as_deref(), Some("first\n第二行🙂"));
    assert_eq!(thread.entries[2].kind, CommentEntryKind::Resolve);
    assert_eq!(thread.entries[3].created_at, 1003);
}

#[test]
fn native_structural_sheet_history_moves_threads_without_losing_entries() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    history.change_comment(&mut book, 0, addr("B2"), create(), 1000).unwrap();
    let thread = book.sheet(0).unwrap().comment(addr("B2")).unwrap().clone();
    history.edit_structure(&mut book, 0, ShiftEdit::RowInsert { at: 1, count: 2 }).unwrap();
    assert_eq!(book.sheet(0).unwrap().comment(addr("B4")), Some(&thread));
    history.undo(&mut book).unwrap();
    assert_eq!(book.sheet(0).unwrap().comment(addr("B2")), Some(&thread));
    history.edit_structure(&mut book, 0, ShiftEdit::ColDelete { at: 1, count: 1 }).unwrap();
    assert!(book.sheet(0).unwrap().comment(addr("B2")).is_none());
    history.undo(&mut book).unwrap();
    history.edit_sheet(&mut book, Some(0), "Renamed").unwrap();
    book.add_sheet("Other");
    history.move_sheet(&mut book, 0, 1).unwrap();
    assert_eq!(book.sheet(1).unwrap().comment(addr("B2")), Some(&thread));
    history.remove_sheet(&mut book, 1).unwrap();
    history.undo(&mut book).unwrap();
    assert_eq!(book.name(1), Some("Renamed"));
    assert_eq!(book.sheet(1).unwrap().comment(addr("B2")), Some(&thread));
}

#[test]
fn value_and_note_changes_preserve_threads_independently() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    history.change_comment(&mut book, 0, addr("C3"), create(), 1000).unwrap();
    let thread = book.sheet(0).unwrap().comment(addr("C3")).unwrap().clone();
    history.change_note(&mut book, 0, addr("C3"), Some("separate note")).unwrap();
    book.set_cell_input(0, "C3", "value").unwrap();
    assert_eq!(book.sheet(0).unwrap().comment(addr("C3")), Some(&thread));
    history.change_note(&mut book, 0, addr("C3"), None).unwrap();
    assert_eq!(book.sheet(0).unwrap().comment(addr("C3")), Some(&thread));
    history.undo(&mut book).unwrap();
    history.change_comment(&mut book, 0, addr("C3"), NativeCommentChange::Resolve { author: "Bob".into() }, 900).unwrap();
    assert_eq!(book.sheet(0).unwrap().note(addr("C3")), Some("separate note"));
    assert_eq!(book.sheet(0).unwrap().comment(addr("C3")).unwrap().entries[1].created_at, 1000);
}
