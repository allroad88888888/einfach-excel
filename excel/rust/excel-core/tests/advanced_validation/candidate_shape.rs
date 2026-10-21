use super::*;
use einfach_excel_core::{TableEntry, TableRegistrySnapshot};

fn sequence(book: &mut Workbook, initial: &str) {
    book.set_cell_input(0, "A1", initial).unwrap();
    book.set_formula(0, "C1", "=SEQUENCE(A1,1,1)");
}

#[test]
fn expanded_candidate_spill_is_read_directly_before_accepting_literal_or_formatted_number() {
    for input in ["2", "200%"] {
        let mut book = Workbook::new();
        let mut history = WorkbookHistory::default();
        sequence(&mut book, "1");
        assert_eq!(book.get_cell("Sheet1", "C2"), Value::Null);
        install(&mut book, range("A1", "A1"), formula("=C2=2", "A1"));
        history.set_cell_input(&mut book, 0, "A1", input).unwrap();
        assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(2.));
        assert_eq!(book.get_cell("Sheet1", "C2"), Value::Number(2.));
        assert_eq!(history.undo_count(), 1);
        history.undo(&mut book).unwrap();
        assert_eq!(book.get_cell("Sheet1", "C2"), Value::Null);
        history.redo(&mut book).unwrap();
        assert_eq!(book.get_cell("Sheet1", "C2"), Value::Number(2.));
        assert_eq!(book.get_cell("Sheet1", "D2"), Value::Null);
    }
}

#[test]
fn expanded_cross_sheet_candidate_spill_is_included_in_native_sum_range() {
    let mut book = Workbook::new();
    book.set_cell_input(0, "A1", "1").unwrap();
    let other = book.add_sheet("Other");
    book.set_formula(other, "C1", "=SEQUENCE(Sheet1!A1,1,1)");
    install(
        &mut book,
        range("A1", "A1"),
        formula("=SUM(Other!C1:C3)=6", "A1"),
    );
    book.set_cell_input(0, "A1", "3").unwrap();
    assert_eq!(book.get_cell("Other", "C3"), Value::Number(3.));
    assert_eq!(book.get_cell("Other", "D3"), Value::Null);
}

#[test]
fn shrinking_candidate_removes_old_spill_members_from_direct_reads_and_sum() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    sequence(&mut book, "3");
    install(
        &mut book,
        range("A1", "A1"),
        formula("=AND(ISBLANK(C2),SUM(C1:C3)=1)", "A1"),
    );
    history.set_cell_input(&mut book, 0, "A1", "1").unwrap();
    assert_eq!(book.get_cell("Sheet1", "C2"), Value::Null);
    assert_eq!(book.get_cell("Sheet1", "C3"), Value::Null);
    history.undo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "C3"), Value::Number(3.));
    history.redo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "C3"), Value::Null);
}

#[test]
fn rejected_candidate_expansion_and_shrink_restore_original_native_spill_without_history() {
    for (before, rejected) in [(1, 3), (3, 1)] {
        let mut book = Workbook::new();
        let mut history = WorkbookHistory::default();
        sequence(&mut book, &before.to_string());
        book.set_cell_input(0, "D2", "neighbour").unwrap();
        install(&mut book, range("A1", "A1"), formula("=FALSE", "A1"));
        assert_eq!(
            history.set_cell_input(&mut book, 0, "A1", &rejected.to_string()),
            Err("DATA_VALIDATION_FAILED".into())
        );
        assert_eq!(history.undo_count(), 0);
        assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(before as f64));
        assert_eq!(
            book.get_cell("Sheet1", "C2"),
            if before == 1 {
                Value::Null
            } else {
                Value::Number(2.)
            }
        );
        assert_eq!(
            book.get_cell("Sheet1", "C3"),
            if before == 1 {
                Value::Null
            } else {
                Value::Number(3.)
            }
        );
        assert_eq!(
            book.get_cell("Sheet1", "D2"),
            Value::Text("neighbour".into())
        );
    }
}

#[test]
fn table_header_validation_reads_spill_after_the_real_column_rename() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    book.restore_tables(TableRegistrySnapshot::from_entries(vec![
        TableEntry::from_parts(
            "Orders",
            "Sheet1",
            range("A1", "B2"),
            true,
            false,
            vec!["Qty".into(), "Price".into()],
        ),
    ]))
    .unwrap();
    book.set_cell(0, "A1", Value::Text("Qty".into()));
    book.set_formula(0, "D1", "=SEQUENCE(LEN(A1),1,1)");
    assert_eq!(book.get_cell("Sheet1", "D5"), Value::Null);
    install(&mut book, range("A1", "A1"), formula("=D5=5", "A1"));
    history.set_cell_input(&mut book, 0, "A1", "Count").unwrap();
    assert_eq!(book.get_table("Orders").unwrap().columns()[0], "Count");
    assert_eq!(book.get_cell("Sheet1", "D5"), Value::Number(5.));
    history.undo(&mut book).unwrap();
    assert_eq!(book.get_table("Orders").unwrap().columns()[0], "Qty");
    assert_eq!(book.get_cell("Sheet1", "D5"), Value::Null);
}

#[test]
fn hyperlink_display_text_validation_reads_real_candidate_spill_and_undo_restores_it() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    book.set_cell_input(0, "A1", "'1").unwrap();
    book.set_formula(0, "C1", "=SEQUENCE(VALUE(A1),1,1)");
    install(&mut book, range("A1", "A1"), formula("=C2=2", "A1"));
    history
        .change_hyperlink(
            &mut book,
            0,
            addr("A1"),
            Some("https://example.com"),
            Some("2"),
        )
        .unwrap();
    assert_eq!(book.get_cell("Sheet1", "C2"), Value::Number(2.));
    assert_eq!(history.undo_count(), 1);
    history.undo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Text("1".into()));
    assert_eq!(book.get_cell("Sheet1", "C2"), Value::Null);
    assert!(book.sheet(0).unwrap().hyperlink(addr("A1")).is_none());
}
