//! 超链接事务必须保留公式/格式，失败不能留下半次修改。
use super::*;
use crate::workbook_history::{ClearSelectionMode, WorkbookHistory};
use crate::{CellFormat, StyleScope, Workbook};
use crate::shift::ShiftEdit;
use einfach_core::Value;

fn addr(input: &str) -> CellAddress { CellAddress::parse(input).unwrap() }

#[test]
fn hyperlink_crud_is_one_history_entry_and_does_not_replace_a_formula_or_format() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    book.set_formula(0, "A1", "=1+2");
    book.sheet_mut(0).unwrap().set_format("A1", CellFormat { bold: true, ..Default::default() });
    for url in [Some("https://example.com/one"), Some("https://example.com/two"), None] {
        let before = book.sheet(0).unwrap().hyperlink(addr("A1")).map(str::to_owned);
        let count = history.undo_count();
        assert!(history.change_hyperlink(&mut book, 0, addr("A1"), url, None).unwrap());
        assert_eq!(history.undo_count(), count + 1);
        assert_eq!(book.sheet(0).unwrap().hyperlink(addr("A1")), url);
        assert_eq!(book.sheet(0).unwrap().get_formula("A1").as_deref(), Some("=1+2"));
        assert!(book.sheet(0).unwrap().effective_format("A1").bold);
        history.undo(&mut book).unwrap();
        assert_eq!(book.sheet(0).unwrap().hyperlink(addr("A1")), before.as_deref());
        history.redo(&mut book).unwrap();
        assert_eq!(book.sheet(0).unwrap().hyperlink(addr("A1")), url);
    }
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(3.0));
}

#[test]
fn display_text_and_url_undo_together_and_literal_text_does_not_become_a_formula() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    book.set_cell_input(0, "A1", "42").unwrap();
    history.change_hyperlink(&mut book, 0, addr("A1"), Some("https://example.com"), Some("=1+2")).unwrap();
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Text("=1+2".into()));
    assert!(book.sheet(0).unwrap().get_formula("A1").is_none());
    assert_eq!(book.sheet(0).unwrap().hyperlink(addr("A1")), Some("https://example.com/"));
    assert!(!history.change_hyperlink(&mut book, 0, addr("A1"), Some("https://example.com/"), Some("=1+2")).unwrap());
    assert_eq!(history.undo_count(), 1);
    history.undo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(42.0));
    assert!(book.sheet(0).unwrap().hyperlink(addr("A1")).is_none());
    history.redo(&mut book).unwrap();
    // 移除链接忽略未保存的显示文字，不清空内容。
    history.change_hyperlink(&mut book, 0, addr("A1"), None, Some("ignored")).unwrap();
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Text("=1+2".into()));
}

#[test]
fn invalid_urls_or_coordinates_never_change_text_or_consume_redo() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    history.change_hyperlink(&mut book, 0, addr("A1"), Some("https://example.com"), Some("before")).unwrap();
    history.undo(&mut book).unwrap();
    for url in ["javascript:alert(1)", "data:text/html,hi", "file:///tmp/test", "//example.com",
        "http://", "https://user:pass@example.com", "https://example.com\n/path", "https:\\example.com"] {
        assert!(history.change_hyperlink(&mut book, 0, addr("A1"), Some(url), Some("bad")).is_err(), "{url}");
        assert_eq!(book.get_cell("Sheet1", "A1"), Value::Null);
        assert!(book.sheet(0).unwrap().hyperlink(addr("A1")).is_none());
        assert_eq!(history.redo_count(), 1);
    }
    assert!(normalize_url(&format!("https://example.com/{}", "中".repeat(1200))).is_err());
    assert!(history.change_hyperlink(&mut book, 0, CellAddress::new(1_048_576, 0), Some("https://example.com"), None).is_err());
    assert!(history.change_hyperlink(&mut book, 5, addr("A1"), Some("https://example.com"), None).is_err());
}

#[test]
fn insert_delete_and_clear_all_keep_links_in_the_same_history_as_cells() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    book.sheet_mut(0).unwrap().set_hyperlink(addr("B2"), Some("https://example.com/")).unwrap();
    history.edit_structure(&mut book, 0, ShiftEdit::RowInsert { at: 1, count: 1 }).unwrap();
    assert!(book.sheet(0).unwrap().hyperlink(addr("B2")).is_none());
    assert!(book.sheet(0).unwrap().hyperlink(addr("B3")).is_some());
    history.undo(&mut book).unwrap();
    assert!(book.sheet(0).unwrap().hyperlink(addr("B2")).is_some());
    history.edit_structure(&mut book, 0, ShiftEdit::ColDelete { at: 1, count: 1 }).unwrap();
    assert!(book.sheet(0).unwrap().hyperlink(addr("B2")).is_none());
    history.undo(&mut book).unwrap();
    let range = CellRange::single(addr("B2"));
    for mode in [ClearSelectionMode::Contents, ClearSelectionMode::Formats, ClearSelectionMode::All] {
        history.clear_selection(&mut book, 0, &[(range, StyleScope::Cell)], mode).unwrap();
        assert_eq!(book.sheet(0).unwrap().hyperlink(addr("B2")).is_none(), mode == ClearSelectionMode::All);
        history.undo(&mut book).unwrap();
        assert!(book.sheet(0).unwrap().hyperlink(addr("B2")).is_some());
    }
}
