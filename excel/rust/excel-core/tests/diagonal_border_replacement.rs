use einfach_excel_core::clipboard::{ClipboardPasteMode, ClipboardPasteOptions};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{BorderSpec, BorderStyle, CellAddress, CellBorders, CellFormat, CellRange, Workbook};

fn at(addr: &str) -> CellRange { CellRange::single(CellAddress::parse(addr).unwrap()) }
fn format(color: &str) -> CellFormat {
    CellFormat { borders: CellBorders { diag_down: Some(BorderSpec {
        style: BorderStyle::Thin, color: Some(color.into()),
    }), ..Default::default() }, ..Default::default() }
}

#[test]
fn replacing_merged_anchor_preserves_diagonals_on_perimeter_placeholders_and_neighbours() {
    let mut book = Workbook::new();
    let merged = CellRange::new(at("C3").start, at("D4").start);
    book.sheet_mut(0).unwrap().restore_merged_ranges(vec![merged]).unwrap();
    for addr in ["C3", "D3", "C4", "D4", "B3", "E4"] {
        book.sheet_mut(0).unwrap().set_format(addr, format("#c00000"));
    }
    book.sheet_mut(0).unwrap().set_format("A1", format("#0000ff"));
    let source = book.capture_clipboard(0, at("A1"), false).unwrap();
    let mut options = ClipboardPasteOptions::new(merged);
    options.mode = ClipboardPasteMode::Formats;
    let mut history = WorkbookHistory::default();
    book.paste_clipboard_with_history(&source, 0, &options, &mut history).unwrap();
    assert_eq!(book.sheet(0).unwrap().get_format("C3").borders.diag_down,
        format("#0000ff").borders.diag_down);
    for addr in ["D3", "C4", "D4", "B3", "E4"] {
        let snapshot = book.sheet(0).unwrap().snapshot_format_range(at(addr));
        let spec = snapshot.cell_styles.iter().find(|(point, _)| *point == at(addr).start)
            .and_then(|(_, style)| style.borders.as_ref()).and_then(|b| b.diag_down.as_ref());
        assert_eq!(spec, format("#c00000").borders.diag_down.as_ref(), "{addr}");
    }
    assert_eq!(history.undo_count(), 1);
    history.undo(&mut book).unwrap();
    assert_eq!(book.sheet(0).unwrap().get_format("C3").borders.diag_down,
        format("#c00000").borders.diag_down);
}
