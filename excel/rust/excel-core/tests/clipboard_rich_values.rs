use einfach_core::Value;
use einfach_excel_core::{CellAddress, CellRange, FontBaseline, Workbook};
use einfach_excel_core::clipboard::{ClipboardPasteMode, ClipboardPasteOptions};
use einfach_excel_core::rich_text::{RichTextFormat, RichTextRun};
use einfach_excel_core::workbook_history::WorkbookHistory;

fn addr(text: &str) -> CellAddress { CellAddress::parse(text).unwrap() }
fn runs(baseline: FontBaseline) -> Vec<RichTextRun> {
    vec![RichTextRun { text: "x".into(), format: RichTextFormat::default() },
        RichTextRun { text: "2".into(), format: RichTextFormat {
            font_baseline: Some(baseline), ..Default::default()
        } }]
}
fn setup() -> Workbook {
    let mut book = Workbook::new();
    book.bulk_load(|loader| {
        loader.set_text_runs_at(0, addr("A1"), "x2".into(), runs(FontBaseline::Superscript)).unwrap();
        loader.set_text_runs_at(0, addr("B1"), "x2".into(), runs(FontBaseline::Subscript)).unwrap();
    });
    book
}

#[test]
fn same_text_values_only_clears_target_runs_and_restores_them_in_one_history_step() {
    let mut book = setup();
    let clip = book.capture_clipboard(0, CellRange::single(addr("A1")), false).unwrap();
    let mut options = ClipboardPasteOptions::new(CellRange::single(addr("B1")));
    options.mode = ClipboardPasteMode::Values;
    let mut history = WorkbookHistory::default();
    book.paste_clipboard_with_history(&clip, 0, &options, &mut history).unwrap();
    assert_eq!(book.get_cell("Sheet1", "B1"), Value::Text("x2".into()));
    assert!(book.sheet(0).unwrap().rich_text(addr("B1")).is_none());
    assert_eq!(book.sheet(0).unwrap().rich_text(addr("A1")).unwrap(), runs(FontBaseline::Superscript));
    assert_eq!(history.undo_count(), 1);
    history.undo(&mut book).unwrap();
    assert_eq!(book.sheet(0).unwrap().rich_text(addr("B1")).unwrap(), runs(FontBaseline::Subscript));
    assert_eq!(history.undo_count(), 0);
    history.redo(&mut book).unwrap();
    assert!(book.sheet(0).unwrap().rich_text(addr("B1")).is_none());
}

#[test]
fn skipped_blank_and_formats_only_do_not_replace_target_character_ranges() {
    let mut book = setup();
    let mut options = ClipboardPasteOptions::new(CellRange::single(addr("B1")));
    options.mode = ClipboardPasteMode::Values;
    options.skip_blanks = true;
    let blank = book.capture_clipboard(0, CellRange::single(addr("C1")), false).unwrap();
    book.paste_clipboard(&blank, 0, &options).unwrap();
    assert_eq!(book.sheet(0).unwrap().rich_text(addr("B1")).unwrap(), runs(FontBaseline::Subscript));
    let rich = book.capture_clipboard(0, CellRange::single(addr("A1")), false).unwrap();
    options.mode = ClipboardPasteMode::Formats;
    options.skip_blanks = false;
    book.paste_clipboard(&rich, 0, &options).unwrap();
    assert_eq!(book.sheet(0).unwrap().rich_text(addr("B1")).unwrap(), runs(FontBaseline::Subscript));
}
