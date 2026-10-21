use super::*;
use einfach_excel_core::protection::ProtectionChange;
use einfach_excel_core::{sheet::BorderPreset, BorderSpec, BorderStyle};
use einfach_excel_core::{CellFormat, CellStyle, StyleScope};

#[test]
fn source_and_target_shared_borders_restore_in_the_same_history_entry() {
    let mut book = workbook();
    book.set_cell(0, "B2", Value::Number(4.));
    let border = BorderSpec {
        style: BorderStyle::Thick,
        color: Some("#c00000".into()),
    };
    book.sheet_mut(0)
        .unwrap()
        .patch_range_borders(range("B2", "B2"), BorderPreset::All, border)
        .unwrap();
    let source_before = book
        .sheet(0)
        .unwrap()
        .snapshot_format_range(range("A1", "C3"));
    let target_before = book
        .sheet(1)
        .unwrap()
        .snapshot_format_range(range("B3", "D5"));
    let clip = cut(&book, "B2", "B2");
    let mut history = WorkbookHistory::default();
    book.paste_clipboard_with_history(&clip, 1, &options("C4"), &mut history)
        .unwrap();
    let source_after = book
        .sheet(0)
        .unwrap()
        .snapshot_format_range(range("A1", "C3"));
    let target_after = book
        .sheet(1)
        .unwrap()
        .snapshot_format_range(range("B3", "D5"));
    history.undo(&mut book).unwrap();
    assert_eq!(
        book.sheet(0)
            .unwrap()
            .snapshot_format_range(range("A1", "C3")),
        source_before
    );
    assert_eq!(
        book.sheet(1)
            .unwrap()
            .snapshot_format_range(range("B3", "D5")),
        target_before
    );
    history.redo(&mut book).unwrap();
    assert_eq!(
        book.sheet(0)
            .unwrap()
            .snapshot_format_range(range("A1", "C3")),
        source_after
    );
    assert_eq!(
        book.sheet(1)
            .unwrap()
            .snapshot_format_range(range("B3", "D5")),
        target_after
    );
}

#[test]
fn a_locked_destination_border_neighbor_blocks_the_entire_move() {
    let mut book = workbook();
    book.set_cell(0, "B2", Value::Number(4.));
    book.sheet_mut(0)
        .unwrap()
        .patch_range_borders(
            range("B2", "B2"),
            BorderPreset::Right,
            BorderSpec {
                style: BorderStyle::Thick,
                color: None,
            },
        )
        .unwrap();
    book.change_protection(
        1,
        ProtectionChange::AllowRange {
            range: range("C4", "C4").into(),
        },
    )
    .unwrap();
    book.change_protection(1, ProtectionChange::Protect)
        .unwrap();
    let clip = cut(&book, "B2", "B2");
    assert!(book.paste_clipboard(&clip, 1, &options("C4")).is_err());
    assert_eq!(book.get_cell("Source O'Brien", "B2"), Value::Number(4.));
    assert_eq!(book.get_cell("Target O'Brien", "C4"), Value::Null);
}

#[test]
fn format_hyperlink_and_blank_payload_move_then_restore_both_sheets() {
    let mut book = workbook();
    let mut history = WorkbookHistory::default();
    book.set_cell(0, "A1", Value::Text("linked".into()));
    book.sheet_mut(0).unwrap().patch_format_range(
        range("A1", "B1"),
        StyleScope::Row,
        CellStyle {
            bold: Some(true),
            italic: Some(true),
            ..Default::default()
        },
    );
    book.sheet_mut(0)
        .unwrap()
        .set_hyperlink(
            CellAddress::parse("A1").unwrap(),
            Some("https://source.example/"),
        )
        .unwrap();
    book.set_cell(1, "D4", Value::Number(99.));
    book.sheet_mut(1).unwrap().set_format(
        "C4",
        CellFormat {
            italic: true,
            ..Default::default()
        },
    );
    book.sheet_mut(1)
        .unwrap()
        .set_hyperlink(
            CellAddress::parse("C4").unwrap(),
            Some("https://target.example/"),
        )
        .unwrap();
    let clip = cut(&book, "A1", "B1");
    book.paste_clipboard_with_history(&clip, 1, &options("C4"), &mut history)
        .unwrap();
    assert_eq!(book.get_cell("Target O'Brien", "D4"), Value::Null);
    assert!(book.sheet(1).unwrap().effective_format("D4").bold);
    assert_eq!(
        book.sheet(1)
            .unwrap()
            .hyperlink(CellAddress::parse("C4").unwrap()),
        Some("https://source.example/")
    );
    assert!(book
        .sheet(0)
        .unwrap()
        .hyperlink(CellAddress::parse("A1").unwrap())
        .is_none());
    assert!(!book.sheet(0).unwrap().effective_format("A1").bold);
    history.undo(&mut book).unwrap();
    assert!(book.sheet(0).unwrap().effective_format("A1").bold);
    assert_eq!(book.get_cell("Target O'Brien", "D4"), Value::Number(99.));
    assert_eq!(
        book.sheet(1)
            .unwrap()
            .hyperlink(CellAddress::parse("C4").unwrap()),
        Some("https://target.example/")
    );
    history.redo(&mut book).unwrap();
    assert_eq!(
        book.sheet(1)
            .unwrap()
            .hyperlink(CellAddress::parse("C4").unwrap()),
        Some("https://source.example/")
    );
}

#[test]
fn changing_only_source_link_invalidates_the_cut_snapshot() {
    let mut book = workbook();
    book.set_cell(0, "A1", Value::Number(4.));
    let clip = cut(&book, "A1", "A1");
    book.sheet_mut(0)
        .unwrap()
        .set_hyperlink(
            CellAddress::parse("A1").unwrap(),
            Some("https://changed.example/"),
        )
        .unwrap();
    assert_eq!(
        book.paste_clipboard(&clip, 1, &options("C4")),
        Err("CLIPBOARD_CUT_SOURCE_CHANGED")
    );
    assert_eq!(book.get_cell("Source O'Brien", "A1"), Value::Number(4.));
}
