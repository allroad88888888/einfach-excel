//! 公共备注命令必须在真实 WorkbookHistory 中保留相邻内容与结构随动。
use einfach_core::Value;
use einfach_excel_core::shift::ShiftEdit;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellFormat, Workbook};

fn addr(text: &str) -> CellAddress {
    CellAddress::parse(text).unwrap()
}

#[test]
fn notes_crud_undo_redo_keeps_formula_format_and_neighbor() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    book.set_formula(0, "A1", "=1+2");
    book.set_cell_input(0, "B1", "neighbor").unwrap();
    book.sheet_mut(0).unwrap().set_format(
        "A1",
        CellFormat {
            bold: true,
            ..Default::default()
        },
    );
    for text in [Some("first\n第二行"), Some("edited"), None] {
        let before = book.sheet(0).unwrap().note(addr("A1")).map(str::to_owned);
        let count = history.undo_count();
        assert!(history.change_note(&mut book, 0, addr("A1"), text).unwrap());
        assert_eq!(history.undo_count(), count + 1);
        assert_eq!(book.sheet(0).unwrap().note(addr("A1")), text);
        history.undo(&mut book).unwrap();
        assert_eq!(book.sheet(0).unwrap().note(addr("A1")), before.as_deref());
        history.redo(&mut book).unwrap();
        assert_eq!(book.sheet(0).unwrap().note(addr("A1")), text);
        assert_eq!(
            book.sheet(0).unwrap().get_formula("A1").as_deref(),
            Some("=1+2")
        );
        assert!(book.sheet(0).unwrap().effective_format("A1").bold);
        assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(3.0));
        assert_eq!(
            book.get_cell("Sheet1", "B1"),
            Value::Text("neighbor".into())
        );
    }
}

#[test]
fn invalid_noop_and_plain_value_edit_preserve_note_history() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    history
        .change_note(&mut book, 0, addr("C3"), Some("keep"))
        .unwrap();
    assert!(!history
        .change_note(&mut book, 0, addr("C3"), Some("keep"))
        .unwrap());
    for text in [" ", "a\0b", &"a".repeat(32768)] {
        assert!(history
            .change_note(&mut book, 0, addr("C3"), Some(text))
            .is_err());
    }
    assert_eq!(history.undo_count(), 1);
    book.set_cell_input(0, "C3", "ordinary content").unwrap();
    assert_eq!(book.sheet(0).unwrap().note(addr("C3")), Some("keep"));
    history.undo(&mut book).unwrap();
    assert!(book.sheet(0).unwrap().note(addr("C3")).is_none());
    assert_eq!(
        book.get_cell("Sheet1", "C3"),
        Value::Text("ordinary content".into())
    );
    assert!(history
        .change_note(&mut book, 0, addr("C3"), Some(" "))
        .is_err());
    assert_eq!(history.redo_count(), 1);
    history.redo(&mut book).unwrap();
    assert_eq!(book.sheet(0).unwrap().note(addr("C3")), Some("keep"));
}

#[test]
fn native_structure_and_sheet_history_carry_notes() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    history
        .change_note(&mut book, 0, addr("B2"), Some("move me"))
        .unwrap();
    history
        .edit_structure(&mut book, 0, ShiftEdit::RowInsert { at: 1, count: 2 })
        .unwrap();
    assert_eq!(book.sheet(0).unwrap().note(addr("B4")), Some("move me"));
    history.undo(&mut book).unwrap();
    assert_eq!(book.sheet(0).unwrap().note(addr("B2")), Some("move me"));
    history
        .edit_structure(&mut book, 0, ShiftEdit::ColDelete { at: 1, count: 1 })
        .unwrap();
    assert!(book.sheet(0).unwrap().note(addr("B2")).is_none());
    history.undo(&mut book).unwrap();
    history.edit_sheet(&mut book, Some(0), "Renamed").unwrap();
    book.add_sheet("Other");
    history.move_sheet(&mut book, 0, 1).unwrap();
    assert_eq!(book.sheet(1).unwrap().note(addr("B2")), Some("move me"));
    history.remove_sheet(&mut book, 1).unwrap();
    history.undo(&mut book).unwrap();
    assert_eq!(book.name(1), Some("Renamed"));
    assert_eq!(book.sheet(1).unwrap().note(addr("B2")), Some("move me"));
}

#[test]
fn native_note_rules_count_unicode_and_enforce_locked_ranges() {
    use einfach_excel_core::notes::normalize_note;
    use einfach_excel_core::protection::{ProtectionChange, ProtectionRange};
    assert_eq!(
        normalize_note("  first\r\n第二行\r🙂  ").unwrap(),
        "  first\n第二行\n🙂  "
    );
    assert!(normalize_note(&"🙂".repeat(32767)).is_ok());
    assert!(normalize_note(&"🙂".repeat(32768)).is_err());
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    book.change_protection(
        0,
        ProtectionChange::AllowRange {
            range: ProtectionRange::from(einfach_excel_core::CellRange::single(addr("A1"))),
        },
    )
    .unwrap();
    book.change_protection(0, ProtectionChange::Protect)
        .unwrap();
    assert!(history
        .change_note(&mut book, 0, addr("B1"), Some("blocked"))
        .is_err());
    assert_eq!(history.undo_count(), 0);
    assert!(book.sheet(0).unwrap().note(addr("B1")).is_none());
    assert!(history
        .change_note(&mut book, 0, addr("A1"), Some("allowed"))
        .unwrap());
    assert_eq!(book.sheet(0).unwrap().note(addr("A1")), Some("allowed"));
}
