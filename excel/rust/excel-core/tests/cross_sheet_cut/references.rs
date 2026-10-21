use super::*;

#[test]
fn complete_rectangle_retargets_three_sheets_and_undo_redo_is_one_step() {
    let mut book = workbook();
    book.set_cell(0, "A1", Value::Number(4.));
    book.set_formula(0, "B1", "=A1+$A$1+$A1+A$1+F1");
    book.set_cell(0, "F1", Value::Number(3.));
    book.set_formula(0, "G1", "=SUM($A1:B$1)");
    book.set_formula(1, "A1", "='Source O''Brien'!$A$1");
    book.set_formula(2, "A1", "=SUM('Source O''Brien'!$A1:B$1)");
    book.set_cell(1, "D4", Value::Number(99.));
    let clip = cut(&book, "A1", "B1");
    let mut history = WorkbookHistory::default();
    book.paste_clipboard_with_history(&clip, 1, &options("C4"), &mut history)
        .unwrap();
    assert_eq!(book.get_cell("Source O'Brien", "A1"), Value::Null);
    assert_eq!(book.get_cell("Target O'Brien", "C4"), Value::Number(4.));
    assert_eq!(book.get_cell("Target O'Brien", "D4"), Value::Number(19.));
    assert_eq!(book.get_cell("Audit", "A1"), Value::Number(23.));
    assert_eq!(
        book.sheet(1).unwrap().get_formula("D4").as_deref(),
        Some("=((((C4+$C$4)+$C4)+C$4)+'Source O''Brien'!F1)")
    );
    assert_eq!(
        book.sheet(0).unwrap().get_formula("G1").as_deref(),
        Some("=SUM('Target O''Brien'!$C4:D$4)")
    );
    assert_eq!(
        book.sheet(1).unwrap().get_formula("A1").as_deref(),
        Some("='Target O''Brien'!$C$4")
    );
    assert_eq!(
        book.sheet(2).unwrap().get_formula("A1").as_deref(),
        Some("=SUM('Target O''Brien'!$C4:D$4)")
    );
    assert_eq!(history.undo_count(), 1);
    assert_eq!(
        history.entries().next().unwrap().affected_sheets(),
        vec![0, 1, 2]
    );
    history.undo(&mut book).unwrap();
    assert_eq!(book.get_cell("Source O'Brien", "B1"), Value::Number(19.));
    assert_eq!(book.get_cell("Target O'Brien", "D4"), Value::Number(99.));
    assert_eq!(
        book.sheet(2).unwrap().get_formula("A1").as_deref(),
        Some("=SUM('Source O''Brien'!$A1:B$1)")
    );
    assert_eq!((history.undo_count(), history.redo_count()), (0, 1));
    history.redo(&mut book).unwrap();
    assert_eq!(book.get_cell("Target O'Brien", "D4"), Value::Number(19.));
    assert_eq!(book.get_cell("Audit", "A1"), Value::Number(23.));
}

#[test]
fn moved_formula_qualifies_unmoved_local_ranges_and_keeps_other_sheet_refs() {
    let mut book = workbook();
    book.set_cell(0, "E1", Value::Number(2.));
    book.set_cell(0, "E2", Value::Number(3.));
    book.set_cell(2, "B1", Value::Number(7.));
    book.set_formula(0, "A1", "=SUM($E1:E$2)+Audit!B1");
    let clip = cut(&book, "A1", "A1");
    book.paste_clipboard(&clip, 1, &options("C4")).unwrap();
    assert_eq!(book.get_cell("Target O'Brien", "C4"), Value::Number(12.));
    assert_eq!(
        book.sheet(1).unwrap().get_formula("C4").as_deref(),
        Some("=(SUM('Source O''Brien'!$E1:E$2)+Audit!B1)")
    );
    book.set_cell(0, "E2", Value::Number(8.));
    assert_eq!(book.get_cell("Target O'Brien", "C4"), Value::Number(17.));
}

#[test]
fn same_coordinates_on_different_sheets_still_rewrite_sheet_identity() {
    let mut book = workbook();
    book.set_cell(0, "A1", Value::Number(4.));
    book.set_formula(2, "A1", "='Source O''Brien'!A1");
    let clip = cut(&book, "A1", "A1");
    book.paste_clipboard(&clip, 1, &options("A1")).unwrap();
    assert_eq!(
        book.sheet(2).unwrap().get_formula("A1").as_deref(),
        Some("='Target O''Brien'!A1")
    );
    assert_eq!(book.get_cell("Audit", "A1"), Value::Number(4.));
}

#[test]
fn destination_local_references_do_not_follow_same_source_coordinates() {
    let mut book = workbook();
    book.set_cell(0, "A1", Value::Number(4.));
    book.set_cell(1, "A1", Value::Number(8.));
    book.set_formula(1, "G1", "=A1");
    let clip = cut(&book, "A1", "A1");
    book.paste_clipboard(&clip, 1, &options("C4")).unwrap();
    assert_eq!(
        book.sheet(1).unwrap().get_formula("G1").as_deref(),
        Some("=A1")
    );
    assert_eq!(book.get_cell("Target O'Brien", "G1"), Value::Number(8.));
}
