//! XSCUT: native authority for cross-sheet cut plans, rollback, and one-step history.
use einfach_core::Value;
use einfach_excel_core::clipboard::{ClipboardPasteOptions, ClipboardSnapshot};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, Workbook};

fn range(a: &str, b: &str) -> CellRange {
    CellRange::new(
        CellAddress::parse(a).unwrap(),
        CellAddress::parse(b).unwrap(),
    )
}

fn options(a: &str) -> ClipboardPasteOptions {
    ClipboardPasteOptions::new(range(a, a))
}

fn workbook() -> Workbook {
    let mut book = Workbook::new();
    book.rename_sheet(0, "Source O'Brien");
    book.add_sheet("Target O'Brien");
    book.add_sheet("Audit");
    book
}

fn cut(book: &Workbook, a: &str, b: &str) -> ClipboardSnapshot {
    book.capture_clipboard(0, range(a, b), true).unwrap()
}

#[path = "cross_sheet_cut/atomic.rs"]
mod atomic;
#[path = "cross_sheet_cut/metadata.rs"]
mod metadata;
#[path = "cross_sheet_cut/named_ranges.rs"]
mod named_ranges;
#[path = "cross_sheet_cut/policies.rs"]
mod policies;
#[path = "cross_sheet_cut/references.rs"]
mod references;
