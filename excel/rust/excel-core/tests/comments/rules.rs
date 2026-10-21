use einfach_excel_core::{CellAddress, Workbook};
use einfach_excel_core::comments::*;
use einfach_excel_core::protection::{ProtectionChange, ProtectionRange};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::shift::ShiftEdit;

fn addr(text: &str) -> CellAddress { CellAddress::parse(text).unwrap() }
fn create() -> NativeCommentChange { NativeCommentChange::Create { author: "Alice".into(), body: "body".into() } }

#[test]
fn invalid_text_identity_state_and_timestamp_do_not_write_history() {
    assert_eq!(normalize_body("  a\r\n🙂  ").unwrap(), "  a\n🙂  ");
    assert!(normalize_body(&"🙂".repeat(32767)).is_ok());
    assert!(normalize_body(&"🙂".repeat(32768)).is_err());
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    for (author, body) in [("", "body"), ("a\nb", "body"), ("Alice", " \n"), ("Alice", "a\0b")] {
        assert!(history.change_comment(&mut book, 0, addr("A1"),
            NativeCommentChange::Create { author: author.into(), body: body.into() }, 1000).is_err());
    }
    assert!(history.change_comment(&mut book, 0, addr("A1"), create(), -1).is_err());
    assert!(history.change_comment(&mut book, 0, addr("A1"),
        NativeCommentChange::Reply { author: "A".into(), body: "x".into() }, 0).is_err());
    assert_eq!(history.undo_count(), 0);
    assert!(book.sheet(0).unwrap().comment(addr("A1")).is_none());
    history.change_comment(&mut book, 0, addr("A1"), create(), 1000).unwrap();
    assert!(history.change_comment(&mut book, 0, addr("A1"), create(), 1001).is_err());
    history.change_comment(&mut book, 0, addr("A1"), NativeCommentChange::Resolve { author: "Bob".into() }, 1001).unwrap();
    assert!(!history.change_comment(&mut book, 0, addr("A1"), NativeCommentChange::Resolve { author: "Bob".into() }, 1001).unwrap());
    assert!(history.change_comment(&mut book, 0, addr("A1"),
        NativeCommentChange::Reply { author: "A".into(), body: "x".into() }, 1002).is_err());
    assert_eq!(history.undo_count(), 2);
}

#[test]
fn protection_checks_all_semantic_and_file_install_entry_points() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    history.change_comment(&mut book, 0, addr("A1"), create(), 1000).unwrap();
    let thread = book.sheet(0).unwrap().comment(addr("A1")).unwrap().clone();
    book.change_protection(0, ProtectionChange::AllowRange { range: ProtectionRange {
        row_start: 1, row_end: 1, col_start: 1, col_end: 1,
    } }).unwrap();
    book.change_protection(0, ProtectionChange::Protect).unwrap();
    for change in [create(), NativeCommentChange::Reply { author: "Bob".into(), body: "reply".into() },
        NativeCommentChange::Resolve { author: "Bob".into() }, NativeCommentChange::Reopen { author: "Bob".into() }] {
        assert!(history.change_comment(&mut book, 0, addr("A1"), change, 1001).is_err());
    }
    assert!(book.restore_comment_thread(0, addr("A1"), thread).is_err());
    assert!(history.change_comment(&mut book, 0, addr("B2"), create(), 1001).unwrap());
    assert_eq!(history.undo_count(), 2);
}

#[test]
fn merge_anchor_and_last_row_insertion_reject_without_metadata_loss() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    history.merge_cells(&mut book, 0,
        einfach_excel_core::CellRange::new(addr("A1"), addr("B1")),
        einfach_excel_core::MergeAction::Merge, false).unwrap();
    assert!(history.change_comment(&mut book, 0, addr("B1"), create(), 1000).is_err());
    history.change_comment(&mut book, 0, addr("A1"), create(), 1000).unwrap();
    history.change_comment(&mut book, 0, addr("A1048576"), create(), 1000).unwrap();
    assert!(history.edit_structure(&mut book, 0, ShiftEdit::RowInsert { at: 0, count: 1 }).is_err());
    assert!(book.sheet(0).unwrap().comment(addr("A1048576")).is_some());
}

#[test]
fn restored_threads_reject_invalid_event_sequences_and_budget_is_counted() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    history.change_comment(&mut book, 0, addr("A1"), create(), 1000).unwrap();
    let thread = book.sheet(0).unwrap().comment(addr("A1")).unwrap().clone();
    assert!(thread.retained_bytes() > 100);
    let mut invalid = thread.clone();
    invalid.resolved = true;
    assert!(book.restore_comment_thread(0, addr("B1"), invalid).is_err());
    let mut invalid = thread.clone();
    invalid.entries.clear();
    assert!(invalid.validate().is_err());
    let mut invalid = thread.clone();
    invalid.entries[0].created_at = -1;
    assert!(invalid.validate().is_err());
    let mut invalid = thread;
    invalid.entries[0].kind = CommentEntryKind::Resolve;
    assert!(invalid.validate().is_err());
}

#[test]
fn unicode_author_and_entry_count_limits_fail_without_partial_writes() {
    assert!(normalize_author(&"🙂".repeat(100)).is_ok());
    assert!(normalize_author(&"🙂".repeat(101)).is_err());
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    let thread = NativeCommentThread { resolved: false, entries: vec![NativeCommentEntry {
        kind: CommentEntryKind::Message, author: "Alice".into(), body: Some("message".into()), created_at: 1000,
    }; MAX_COMMENT_ENTRIES] };
    book.restore_comment_thread(0, addr("A1"), thread.clone()).unwrap();
    assert!(history.change_comment(&mut book, 0, addr("A1"),
        NativeCommentChange::Reply { author: "Bob".into(), body: "extra".into() }, 1001).is_err());
    assert_eq!(history.undo_count(), 0);
    assert_eq!(book.sheet(0).unwrap().comment(addr("A1")), Some(&thread));
    assert!(book.restore_comment_thread(0, CellAddress::new(1_048_576, 0), thread).is_err());
}
