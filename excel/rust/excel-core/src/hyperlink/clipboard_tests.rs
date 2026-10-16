//! 链接是复制内容的元数据；仅粘贴值/格式不能意外覆盖目标链接。
use super::*;
use crate::Workbook;
use crate::clipboard::{ClipboardPasteMode as Mode, ClipboardPasteOptions, ClipboardSnapshot};
use crate::workbook_history::WorkbookHistory;

fn addr(input: &str) -> CellAddress { CellAddress::parse(input).unwrap() }
fn range(a: &str, b: &str) -> CellRange { CellRange::new(addr(a), addr(b)) }

#[test]
fn copy_paste_modes_and_external_plain_text_have_explicit_link_semantics() {
    for mode in [Mode::All, Mode::Values, Mode::Formats, Mode::Formulas, Mode::ValuesAndFormats] {
        let mut book = Workbook::new();
        book.set_cell_input(0, "A1", "source").unwrap();
        book.sheet_mut(0).unwrap().set_hyperlink(addr("A1"), Some("https://source.example/")).unwrap();
        book.sheet_mut(0).unwrap().set_hyperlink(addr("C3"), Some("https://target.example/")).unwrap();
        let clip = book.capture_clipboard(0, range("A1", "A1"), false).unwrap();
        let mut options = ClipboardPasteOptions::new(range("C3", "C3"));
        options.mode = mode;
        let mut history = WorkbookHistory::default();
        book.paste_clipboard_with_history(&clip, 0, &options, &mut history).unwrap();
        assert_eq!(book.sheet(0).unwrap().hyperlink(addr("C3")), Some(if mode == Mode::All {
            "https://source.example/"
        } else { "https://target.example/" }));
        history.undo(&mut book).unwrap();
        assert_eq!(book.sheet(0).unwrap().hyperlink(addr("C3")), Some("https://target.example/"));
        let plain = ClipboardSnapshot::from_tsv("plain", Mode::All).unwrap();
        options.mode = Mode::All;
        book.paste_clipboard_with_history(&plain, 0, &options, &mut history).unwrap();
        assert!(book.sheet(0).unwrap().hyperlink(addr("C3")).is_none());
    }
}

#[test]
fn blank_link_copies_and_transposes_with_its_source_coordinate() {
    let mut book = Workbook::new();
    book.sheet_mut(0).unwrap().set_hyperlink(addr("B1"), Some("https://blank.example/")).unwrap();
    let clip = book.capture_clipboard(0, range("A1", "B1"), false).unwrap();
    let mut options = ClipboardPasteOptions::new(range("C3", "C3"));
    options.transpose = true;
    let mut history = WorkbookHistory::default();
    book.paste_clipboard_with_history(&clip, 0, &options, &mut history).unwrap();
    assert!(book.sheet(0).unwrap().hyperlink(addr("C3")).is_none());
    assert_eq!(book.sheet(0).unwrap().hyperlink(addr("C4")), Some("https://blank.example/"));
    history.undo(&mut book).unwrap();
    assert!(book.sheet(0).unwrap().hyperlink(addr("C4")).is_none());
}

#[test]
fn overlapping_cut_moves_links_and_one_undo_restores_both_ends() {
    let mut book = Workbook::new();
    for (address, url) in [("A1", "https://one.example/"), ("A2", "https://two.example/")] {
        book.set_cell_input(0, address, address).unwrap();
        book.sheet_mut(0).unwrap().set_hyperlink(addr(address), Some(url)).unwrap();
    }
    let clip = book.capture_clipboard(0, range("A1", "A2"), true).unwrap();
    let mut history = WorkbookHistory::default();
    book.paste_clipboard_with_history(&clip, 0, &ClipboardPasteOptions::new(range("A2", "A2")), &mut history).unwrap();
    assert!(book.sheet(0).unwrap().hyperlink(addr("A1")).is_none());
    assert_eq!(book.sheet(0).unwrap().hyperlink(addr("A2")), Some("https://one.example/"));
    assert_eq!(book.sheet(0).unwrap().hyperlink(addr("A3")), Some("https://two.example/"));
    assert_eq!(history.undo_count(), 1);
    history.undo(&mut book).unwrap();
    assert_eq!(book.sheet(0).unwrap().hyperlink(addr("A1")), Some("https://one.example/"));
    assert_eq!(book.sheet(0).unwrap().hyperlink(addr("A2")), Some("https://two.example/"));
    assert!(book.sheet(0).unwrap().hyperlink(addr("A3")).is_none());
}

#[test]
fn table_generated_headers_outside_paste_have_no_clipboard_source() {
    let mut book = Workbook::new();
    book.set_cell_input(0, "A1", "Qty").unwrap();
    book.set_cell_input(0, "A2", "1").unwrap();
    book.define_table(Some("Orders"), 0, range("A1", "A2"), true).unwrap();
    book.set_cell_input(0, "D1", "Website").unwrap();
    book.sheet_mut(0).unwrap().set_hyperlink(addr("D1"), Some("https://source.example/")).unwrap();
    let clip = book.capture_clipboard(0, range("D1", "D1"), false).unwrap();
    let mut history = WorkbookHistory::default();
    book.paste_clipboard_with_history(&clip, 0,
        &ClipboardPasteOptions::new(range("B2", "B2")), &mut history).unwrap();
    assert!(book.sheet(0).unwrap().hyperlink(addr("B1")).is_none());
    assert_eq!(book.sheet(0).unwrap().hyperlink(addr("B2")), Some("https://source.example/"));
    history.undo(&mut book).unwrap();
    assert!(book.sheet(0).unwrap().hyperlink(addr("B2")).is_none());
    assert_eq!(book.get_table("Orders").unwrap().range(), range("A1", "A2"));
}
