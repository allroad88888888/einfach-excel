//! 局部表头腾位移动数组源码，不能把子格结果固化为字面量。
use einfach_core::Value;
use einfach_excel_core::{CellAddress, CellRange, Workbook};
use einfach_excel_core::workbook::{TableEntry, TableRegistrySnapshot};
use einfach_excel_core::workbook_history::WorkbookHistory;

fn range(a: &str, b: &str) -> CellRange {
    CellRange::new(CellAddress::parse(a).unwrap(), CellAddress::parse(b).unwrap())
}
fn seed() -> (Workbook, WorkbookHistory) {
    let mut book = Workbook::new();
    book.restore_tables(TableRegistrySnapshot::from_entries(vec![TableEntry::from_parts(
        "Orders", "Sheet1", range("B3", "C4"), false, false, vec!["Qty".into(), "Tax".into()],
    )])).unwrap();
    book.set_cell(0, "B2", Value::Text("Occupied".into()));
    book.set_cell(0, "B3", Value::Number(2.));
    book.set_cell(0, "B4", Value::Number(3.));
    (book, WorkbookHistory::default())
}

#[test]
fn complete_array_moves_and_cross_sheet_children_remain_live_through_history() {
    let (mut book, mut history) = seed();
    book.set_formula(0, "B6", "=SEQUENCE(B3,2,10)");
    book.set_formula(0, "E6", "=SEQUENCE(2,2,20)");
    book.add_sheet("Report");
    book.set_formula(1, "A1", "=Sheet1!B6:C7");
    book.set_formula(1, "D1", "=SUM(Sheet1!B6:C7)");
    history.set_table_headers(&mut book, "Orders", true, 100).unwrap();
    for _ in 0..2 {
        assert_eq!(book.get_cell("Report", "B2"), Value::Number(13.));
        assert_eq!(book.get_cell("Report", "D1"), Value::Number(46.));
        assert_eq!(book.get_cell("Sheet1", "C8"), Value::Number(13.));
        assert_eq!(book.get_cell("Sheet1", "B6"), Value::Null);
        assert_eq!(book.get_cell("Sheet1", "F7"), Value::Number(23.));
        assert_eq!(book.sheet(0).unwrap().get_formula("B7").as_deref(), Some("=SEQUENCE(B4,2,10)"));
        assert_eq!(book.sheet(0).unwrap().spill_anchor_for(CellAddress::parse("C8").unwrap()),
            Some(CellAddress::parse("B7").unwrap()));
        assert_eq!(history.undo_count(), 1);
        history.undo(&mut book).unwrap();
        assert_eq!(book.get_cell("Sheet1", "C7"), Value::Number(13.));
        assert_eq!(book.get_cell("Sheet1", "C8"), Value::Null);
        assert_eq!(book.get_cell("Report", "B2"), Value::Number(13.));
        assert_eq!(book.sheet(0).unwrap().get_formula("B6").as_deref(), Some("=SEQUENCE(B3,2,10)"));
        history.redo(&mut book).unwrap();
    }
    book.set_cell(0, "B4", Value::Number(3.));
    assert_eq!(book.get_cell("Sheet1", "C9"), Value::Number(15.));
    assert_eq!(book.sheet(0).unwrap().debug_spill_target_count(),
        book.sheet(0).unwrap().debug_spill_reverse_index_len());
}

#[test]
fn a_scalar_formula_can_become_an_array_after_moving_and_still_undo_exactly() {
    let (mut book, mut history) = seed();
    book.set_formula(0, "B10", "=IF(ROW()=10,1,SEQUENCE(2,2))");
    assert_eq!(book.get_cell("Sheet1", "B10"), Value::Number(1.));
    history.set_table_headers(&mut book, "Orders", true, 100).unwrap();
    assert_eq!(book.get_cell("Sheet1", "C12"), Value::Number(4.));
    history.undo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "B10"), Value::Number(1.));
    assert_eq!(book.get_cell("Sheet1", "C12"), Value::Null);
    history.redo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "C12"), Value::Number(4.));
}

#[test]
fn partial_array_or_projection_overflow_rejects_atomically_and_preserves_redo() {
    for (anchor, formula) in [("A6", "=SEQUENCE(2,2)"), ("C6", "=SEQUENCE(2,2)"),
        ("B99", "=SEQUENCE(2,2)")] {
        let (mut book, mut history) = seed();
        book.set_formula(0, anchor, formula);
        history.set_cell_input(&mut book, 0, "F1", "7").unwrap();
        history.undo(&mut book).unwrap();
        let tables = book.snapshot_tables();
        let value = book.get_cell("Sheet1", anchor);
        assert!(history.set_table_headers(&mut book, "Orders", true, 100).is_err());
        assert_eq!(book.snapshot_tables(), tables);
        assert_eq!(book.get_cell("Sheet1", anchor), value);
        assert_eq!(book.get_cell("Sheet1", "B3"), Value::Number(2.));
        assert_eq!(history.undo_count(), 0);
        assert_eq!(history.redo_count(), 1);
    }
}

#[test]
fn empty_spill_above_headers_uses_local_insertion_without_overwriting_its_anchor() {
    let (mut book, mut history) = seed();
    book.clear_cell(0, "B2");
    book.set_formula(0, "A2", "={\"\",\"\",\"\",\"\"}");
    assert_eq!(book.sheet(0).unwrap().spill_info(CellAddress::parse("A2").unwrap()), Some((1, 4)));
    history.set_table_headers(&mut book, "Orders", true, 100).unwrap();
    assert_eq!(book.get_table("Orders").unwrap().range(), range("B3", "C5"));
    assert_eq!(book.get_cell("Sheet1", "B3"), Value::Text("Qty".into()));
    assert_eq!(book.get_cell("Sheet1", "C2"), Value::Text("".into()));
    history.undo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "B3"), Value::Number(2.));
    assert_eq!(book.get_cell("Sheet1", "C2"), Value::Text("".into()));
}

#[test]
fn blocked_array_and_its_obstruction_move_together_then_can_be_repaired() {
    let (mut book, mut history) = seed();
    book.set_cell(0, "C7", Value::Number(99.));
    book.set_formula(0, "B6", "=SEQUENCE(2,2)");
    assert!(matches!(book.get_cell("Sheet1", "B6"), Value::Error(_)));
    history.set_table_headers(&mut book, "Orders", true, 100).unwrap();
    assert!(matches!(book.get_cell("Sheet1", "B7"), Value::Error(_)));
    assert_eq!(book.get_cell("Sheet1", "C8"), Value::Number(99.));
    history.set_cell_input(&mut book, 0, "C8", "").unwrap();
    assert_eq!(book.get_cell("Sheet1", "C8"), Value::Number(4.));
    history.undo(&mut book).unwrap();
    history.undo(&mut book).unwrap();
    assert!(matches!(book.get_cell("Sheet1", "B6"), Value::Error(_)));
    assert_eq!(book.get_cell("Sheet1", "C7"), Value::Number(99.));
    history.redo(&mut book).unwrap();
    history.redo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "C8"), Value::Number(4.));
}

#[test]
fn literal_array_values_keep_their_projection_inside_and_outside_the_moved_band() {
    let (mut book, mut history) = seed();
    let values = std::sync::Arc::new(einfach_core::ArrayData::new(2, 2,
        vec![Value::Number(1.), Value::Null, Value::Number(3.), Value::Number(4.)]));
    book.sheet_mut(0).unwrap().set_array("B6", values.clone()).unwrap();
    book.sheet_mut(0).unwrap().set_array("E6", values).unwrap();
    history.set_table_headers(&mut book, "Orders", true, 100).unwrap();
    assert_eq!(book.get_cell("Sheet1", "C8"), Value::Number(4.));
    assert_eq!(book.get_cell("Sheet1", "F7"), Value::Number(4.));
    history.undo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "C7"), Value::Number(4.));
    assert_eq!(book.get_cell("Sheet1", "C8"), Value::Null);
    assert_eq!(book.get_cell("Sheet1", "F7"), Value::Number(4.));
    history.redo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "C8"), Value::Number(4.));
}
