//! 多块复制：同列块按行堆叠、同行块按列并排，粘贴后是紧凑矩形。
use einfach_core::Value;
use einfach_excel_core::clipboard::ClipboardPasteOptions;
use einfach_excel_core::{CellAddress, CellRange, Workbook};

fn rect(a: &str, b: &str) -> CellRange {
    CellRange::new(CellAddress::parse(a).unwrap(), CellAddress::parse(b).unwrap())
}
/// A/B/C 列第 n 行分别是 n*10、n*10+1、n*10+2。
fn book() -> Workbook {
    let mut book = Workbook::new();
    for row in 1..=4u32 {
        for (offset, col) in ["A", "B", "C"].iter().enumerate() {
            book.set_cell(0, &format!("{col}{row}"), Value::Number(f64::from(row * 10 + offset as u32)));
        }
    }
    book
}

#[test]
fn same_column_blocks_copy_as_stacked_rows_and_paste_compactly() {
    let mut book = book();
    let snapshot = book.capture_clipboard_blocks(0, &[rect("A1", "B1"), rect("A3", "B4")], false).unwrap();
    assert_eq!((snapshot.rows(), snapshot.cols()), (3, 2));
    assert_eq!(snapshot.text(), "10\t11\n30\t31\n40\t41");
    let target = book.paste_clipboard(&snapshot, 0, &ClipboardPasteOptions::new(rect("E1", "E1"))).unwrap();
    assert_eq!(target, rect("E1", "F3"));
    assert_eq!(book.get_cell("Sheet1", "E2"), Value::Number(30.0));
    assert_eq!(book.get_cell("Sheet1", "F3"), Value::Number(41.0));
}

#[test]
fn same_row_blocks_skip_the_gap_columns() {
    let mut book = book();
    let snapshot = book.capture_clipboard_blocks(0, &[rect("A1", "A2"), rect("C1", "C2")], false).unwrap();
    assert_eq!((snapshot.rows(), snapshot.cols()), (2, 2));
    assert_eq!(snapshot.text(), "10\t12\n20\t22");
    book.paste_clipboard(&snapshot, 0, &ClipboardPasteOptions::new(rect("E1", "E1"))).unwrap();
    assert_eq!(book.get_cell("Sheet1", "F2"), Value::Number(22.0));
}

#[test]
fn mismatched_blocks_and_multi_cut_are_rejected() {
    let book = book();
    assert_eq!(
        book.capture_clipboard_blocks(0, &[rect("A1", "B1"), rect("A3", "C4")], false).unwrap_err(),
        "CLIPBOARD_MULTI_SHAPE"
    );
    assert_eq!(
        book.capture_clipboard_blocks(0, &[rect("A1", "B1"), rect("A3", "B4")], true).unwrap_err(),
        "CLIPBOARD_MULTI_CUT"
    );
}
