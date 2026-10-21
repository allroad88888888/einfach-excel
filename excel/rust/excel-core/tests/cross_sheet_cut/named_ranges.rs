//! A named range keeps its stable source identity; unsupported moves must reject before clearing it.
use super::*;

#[test]
fn named_ranges_silent_calculation_repro_rejects_without_changing_redo_or_snapshot() {
    let mut book = workbook();
    let mut history = WorkbookHistory::default();
    history.set_cell_input(&mut book, 1, "H1", "redo").unwrap();
    history.undo(&mut book).unwrap();
    book.set_cell(0, "A1", Value::Number(4.));
    book.set_cell(0, "F1", Value::Number(12.));
    book.set_cell(1, "C4", Value::Number(9.));
    book.define_named_range("Sales", 0, range("A1", "A1"))
        .unwrap();
    book.set_formula(2, "A1", "=SUM(Sales)");
    book.set_formula(2, "B1", "='Source O''Brien'!A1");
    assert_eq!(book.get_cell("Audit", "A1"), Value::Number(4.));
    let definitions = book.snapshot_named_ranges();
    let clip = cut(&book, "A1", "A1");
    let outcome = book.paste_clipboard_with_history(&clip, 1, &options("C4"), &mut history);
    // Red evidence includes the actual silent result (old code succeeds, Audit becomes zero).
    println!(
        "XSCUT named range: outcome={outcome:?}, source={:?}, target={:?}, audit={:?}",
        book.get_cell("Source O'Brien", "A1"),
        book.get_cell("Target O'Brien", "C4"),
        book.get_cell("Audit", "A1")
    );
    assert_eq!(outcome, Err("CLIPBOARD_CROSS_SHEET_NAMED_RANGE"));
    assert_eq!(book.get_cell("Source O'Brien", "A1"), Value::Number(4.));
    assert_eq!(book.get_cell("Target O'Brien", "C4"), Value::Number(9.));
    assert_eq!(book.get_cell("Audit", "A1"), Value::Number(4.));
    assert_eq!(
        book.sheet(2).unwrap().get_formula("B1").as_deref(),
        Some("='Source O''Brien'!A1")
    );
    assert_eq!(book.snapshot_named_ranges(), definitions);
    assert_eq!((history.undo_count(), history.redo_count()), (0, 1));
    assert!(!history.is_pending());
    // Repair the definition without changing the cut input; the same native snapshot can retry.
    book.define_named_range("Sales", 0, range("F1", "F1"))
        .unwrap();
    book.paste_clipboard_with_history(&clip, 1, &options("C4"), &mut history)
        .unwrap();
    assert_eq!(book.get_cell("Target O'Brien", "C4"), Value::Number(4.));
    assert_eq!(book.get_cell("Audit", "A1"), Value::Number(12.));
    assert_eq!(
        book.sheet(2).unwrap().get_formula("B1").as_deref(),
        Some("='Target O''Brien'!C4")
    );
    assert_eq!(history.undo_count(), 1);
}

#[test]
fn named_ranges_complete_and_partial_intersections_reject_without_host_history() {
    for (named, moved) in [
        (range("A1", "A1"), range("A1", "A1")),
        (range("A1", "A3"), range("A1", "A1")),
        (range("A2", "A2"), range("A1", "A3")),
        (range("A1", "B2"), range("B2", "C3")),
    ] {
        let mut book = workbook();
        book.set_cell(0, "A1", Value::Number(4.));
        book.set_cell(1, "C4", Value::Number(9.));
        book.define_named_range("Sales", 0, named).unwrap();
        let clip = book.capture_clipboard(0, moved, true).unwrap();
        assert_eq!(
            book.paste_clipboard(&clip, 1, &options("C4")),
            Err("CLIPBOARD_CROSS_SHEET_NAMED_RANGE")
        );
        assert_eq!(book.get_cell("Source O'Brien", "A1"), Value::Number(4.));
        assert_eq!(book.get_cell("Target O'Brien", "C4"), Value::Number(9.));
        assert_eq!(
            book.named_range("Sales"),
            Ok(Some(("Source O'Brien".into(), named)))
        );
    }
}

#[test]
fn named_ranges_query_uses_current_stable_sheet_identity_after_rename_and_reorder() {
    let mut book = workbook();
    book.set_cell(0, "A1", Value::Number(4.));
    book.define_named_range("Sales", 0, range("A1", "A1"))
        .unwrap();
    book.rename_sheet(0, "Renamed Source");
    book.move_sheet(0, 1);
    let clip = book.capture_clipboard(1, range("A1", "A1"), true).unwrap();
    assert_eq!(
        book.paste_clipboard(&clip, 0, &options("C4")),
        Err("CLIPBOARD_CROSS_SHEET_NAMED_RANGE")
    );
    assert_eq!(book.get_cell("Renamed Source", "A1"), Value::Number(4.));
    assert_eq!(book.get_cell("Target O'Brien", "C4"), Value::Null);
}

#[test]
fn named_ranges_deleted_source_does_not_attach_to_a_recreated_sheet_with_the_same_name() {
    let mut book = workbook();
    book.define_named_range("Sales", 0, range("A1", "A1"))
        .unwrap();
    book.remove_sheet(0).unwrap();
    let replacement = book.add_sheet("Source O'Brien");
    book.set_cell(replacement, "A1", Value::Number(4.));
    let clip = book
        .capture_clipboard(replacement, range("A1", "A1"), true)
        .unwrap();
    book.paste_clipboard(&clip, 0, &options("C4")).unwrap();
    assert_eq!(book.get_cell("Target O'Brien", "C4"), Value::Number(4.));
    assert!(book.named_range("Sales").is_err());
}

#[test]
fn named_ranges_unrelated_ranges_values_expressions_and_lexical_names_remain_supported() {
    let mut book = workbook();
    book.set_cell(0, "A1", Value::Number(4.));
    book.set_formula(0, "B1", "=LET(Local,3,LAMBDA(x,x+Local)(2))");
    book.define_named_range("Distant", 0, range("F1", "F1"))
        .unwrap();
    book.define_named_range("Destination", 1, range("A1", "A1"))
        .unwrap();
    book.define_name_value("Local", Value::Number(50.)).unwrap();
    book.define_name("Expression", "=2+3").unwrap();
    book.set_formula(2, "A1", "=Local+Expression");
    let clip = cut(&book, "A1", "B1");
    book.paste_clipboard(&clip, 1, &options("C4")).unwrap();
    assert_eq!(book.get_cell("Target O'Brien", "C4"), Value::Number(4.));
    assert_eq!(book.get_cell("Target O'Brien", "D4"), Value::Number(5.));
    assert_eq!(book.get_cell("Audit", "A1"), Value::Number(55.));
}

#[test]
fn named_ranges_registered_after_capture_are_checked_at_paste_time() {
    let mut book = workbook();
    book.set_cell(0, "A1", Value::Number(4.));
    let clip = cut(&book, "A1", "A1");
    book.define_named_range("NewName", 0, range("A1", "A1"))
        .unwrap();
    assert_eq!(
        book.paste_clipboard(&clip, 1, &options("C4")),
        Err("CLIPBOARD_CROSS_SHEET_NAMED_RANGE")
    );
    assert_eq!(book.get_cell("Source O'Brien", "A1"), Value::Number(4.));
}
