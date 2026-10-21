use super::*;

#[test]
fn note_text_keeps_multiline_spaces_and_unicode() {
    assert_eq!(
        normalize_note("  first\r\n第二行\r🙂  "),
        Ok("  first\n第二行\n🙂  ".into())
    );
    assert!(normalize_note(&"🙂".repeat(MAX_NOTE_CHARACTERS)).is_ok());
    assert!(normalize_note(&"🙂".repeat(MAX_NOTE_CHARACTERS + 1)).is_err());
    assert!(normalize_note("\n \t").is_err());
    assert!(normalize_note("a\0b").is_err());
}

#[test]
fn blank_cells_are_sparse_and_explicit_delete_is_idempotent() {
    let mut sheet = Sheet::new();
    let addr = CellAddress::new(50, 8);
    assert_eq!(sheet.set_note(addr, Some("note\nline")), Ok(true));
    assert_eq!(sheet.set_note(addr, Some("note\r\nline")), Ok(false));
    assert_eq!(
        sheet.notes_in_range(CellRange::single(addr)),
        vec![(addr, "note\nline".into())]
    );
    assert!(sheet.set_note(addr, Some(" ")).is_err());
    assert_eq!(sheet.note(addr), Some("note\nline"));
    assert_eq!(sheet.set_note(addr, None), Ok(true));
    assert_eq!(sheet.set_note(addr, None), Ok(false));
    assert!(sheet
        .set_note(CellAddress::new(1_048_576, 0), Some("invalid"))
        .is_err());
}

#[test]
fn note_structure_deletes_band_and_moves_both_axes() {
    use crate::shift::ShiftEdit;
    let mut sheet = Sheet::new();
    sheet
        .set_note(CellAddress::new(2, 3), Some("move"))
        .unwrap();
    sheet.shift_notes(ShiftEdit::RowInsert { at: 1, count: 2 });
    sheet.shift_notes(ShiftEdit::ColInsert { at: 2, count: 1 });
    assert_eq!(sheet.note(CellAddress::new(4, 4)), Some("move"));
    sheet.shift_notes(ShiftEdit::RowDelete { at: 4, count: 1 });
    assert!(sheet.notes.is_empty());
    sheet
        .set_note(CellAddress::new(1_048_575, 0), Some("edge"))
        .unwrap();
    assert!(sheet
        .validate_note_shift(ShiftEdit::RowInsert { at: 0, count: 1 })
        .is_err());
}
