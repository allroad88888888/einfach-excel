//! Table 创建必须使可见表头、列名、原生历史成为同一次操作。
use einfach_core::{Value, ValueError};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, Workbook};

fn range(start: &str, end: &str) -> CellRange {
    CellRange::new(
        CellAddress::parse(start).unwrap(),
        CellAddress::parse(end).unwrap(),
    )
}

#[test]
fn normalized_headers_and_registry_undo_together_without_copying_body() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Text(" Amount ".into()));
    wb.set_cell(0, "B1", Value::Text("amount".into()));
    wb.set_formula(0, "D1", "=2+3");
    wb.set_cell(0, "A2", Value::Number(10.0));
    wb.set_cell(0, "A3", Value::Number(20.0));
    wb.set_formula(0, "F1", "=SUM(Inventory[Amount])");
    let mut history = WorkbookHistory::default();
    let atoms = wb.sheet(0).unwrap().debug_materialized_cell_atom_count();
    assert_eq!(
        history
            .create_table(&mut wb, 0, range("A1", "D1048576"), Some("Inventory"))
            .unwrap(),
        "Inventory"
    );
    assert_eq!(history.undo_count(), 1);
    assert_eq!(
        wb.get_table("Inventory").unwrap().columns(),
        &["Amount", "Column1", "Column2", "5"]
    );
    for (address, text) in [
        ("A1", "Amount"),
        ("B1", "Column1"),
        ("C1", "Column2"),
        ("D1", "5"),
    ] {
        assert_eq!(wb.get_cell("Sheet1", address), Value::Text(text.into()));
        assert!(wb
            .sheet(0)
            .unwrap()
            .formula_text_at(CellAddress::parse(address).unwrap())
            .is_none());
    }
    assert_eq!(wb.get_cell("Sheet1", "F1"), Value::Number(30.0));
    assert!(wb.sheet(0).unwrap().debug_materialized_cell_atom_count() <= atoms + 8);
    wb.define_table(Some("Other"), 0, range("H1", "H3"), true)
        .unwrap();
    for _ in 0..3 {
        history.undo(&mut wb).unwrap();
        assert!(wb.get_table("Inventory").is_none());
        assert!(wb.get_table("Other").is_some());
        assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Text(" Amount ".into()));
        assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Text("amount".into()));
        assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Null);
        assert_eq!(
            wb.sheet(0)
                .unwrap()
                .formula_text_at(CellAddress::parse("D1").unwrap())
                .as_deref(),
            Some("=2+3")
        );
        assert_eq!(
            wb.get_cell("Sheet1", "F1"),
            Value::Error(ValueError::InvalidName)
        );
        history.redo(&mut wb).unwrap();
        assert_eq!(wb.get_cell("Sheet1", "F1"), Value::Number(30.0));
        assert_eq!(wb.get_cell("Sheet1", "A3"), Value::Number(20.0));
    }
}

#[test]
fn invalid_requests_do_not_write_headers_or_consume_redo() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    history
        .create_table(&mut wb, 0, range("A1", "B4"), None)
        .unwrap();
    history.undo(&mut wb).unwrap();
    wb.define_name_value("Taken", Value::Number(1.0)).unwrap();
    wb.define_table(Some("Existing"), 0, range("D1", "E5"), true)
        .unwrap();
    wb.sheet_mut(0)
        .unwrap()
        .restore_merged_ranges(vec![range("G3", "H3")])
        .unwrap();
    wb.set_formula(0, "J3", "=SEQUENCE(2,2)");
    let epoch = wb.tables_epoch();
    for (sheet, target, name) in [
        (99, range("A1", "B4"), None),
        (0, range("A1", "B4"), Some("Taken")),
        (0, range("A1", "B4"), Some("A1")),
        (0, range("A1", "B4"), Some("bad name")),
        (0, range("C1", "D4"), None),
        (0, range("G1", "G4"), None),
        (0, range("K1", "K4"), None),
        (0, CellRange::single(CellAddress::new(1_048_576, 0)), None),
        (0, CellRange::single(CellAddress::new(0, 16_384)), None),
    ] {
        assert!(
            history.create_table(&mut wb, sheet, target, name).is_err(),
            "{target:?}"
        );
        assert_eq!(history.redo_count(), 1);
        assert_eq!(wb.tables_epoch(), epoch);
        assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Null);
    }
    history.redo(&mut wb).unwrap();
    assert!(wb.get_table("Table1").is_some());
}

#[test]
fn history_rejects_foreign_workbook_header_edits_and_redo_name_conflicts() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    history
        .begin(&wb, 0, range("A1", "A1"), "Pending", true)
        .unwrap();
    assert!(history
        .create_table(&mut wb, 0, range("A1", "B4"), None)
        .is_err());
    history.finish(&mut wb, true).unwrap();
    history
        .create_table(&mut wb, 0, range("A1", "B4"), None)
        .unwrap();
    assert!(history.undo(&mut Workbook::new()).is_err());
    wb.set_cell(0, "A1", Value::Text("External".into()));
    assert!(history.undo(&mut wb).is_err());
    assert!(wb.get_table("Table1").is_some());
    assert_eq!(history.undo_count(), 1);
    wb.set_cell(0, "A1", Value::Text("Column1".into()));
    history.undo(&mut wb).unwrap();
    wb.define_name_value("Table1", Value::Number(7.0)).unwrap();
    assert!(history.redo(&mut wb).is_err());
    assert_eq!(history.redo_count(), 1);
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Null);
}

#[test]
fn subscribers_observe_only_the_complete_table_creation() {
    use std::{cell::Cell, rc::Rc};
    let mut wb = Workbook::new();
    wb.set_cell(0, "A2", Value::Number(10.0));
    wb.set_formula(0, "D1", "=SUM(Inventory[Column1])");
    let hits = Rc::new(Cell::new(0));
    let seen = hits.clone();
    let subscription = wb
        .sheet_mut(0)
        .unwrap()
        .subscribe_cell("D1", move || seen.set(seen.get() + 1));
    let mut history = WorkbookHistory::default();
    hits.set(0);
    history
        .create_table(&mut wb, 0, range("A1", "A3"), Some("Inventory"))
        .unwrap();
    assert_eq!(hits.replace(0), 1);
    assert_eq!(wb.get_cell("Sheet1", "D1"), Value::Number(10.0));
    history.undo(&mut wb).unwrap();
    assert_eq!(hits.replace(0), 1);
    history.redo(&mut wb).unwrap();
    assert_eq!(hits.get(), 1);
    wb.sheet_mut(0).unwrap().unsubscribe_cell(subscription);
}

#[test]
fn redo_revalidates_geometry_without_overwriting_external_tables_or_merges() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    // 反向选区只规范化坐标，不改变自动名称或表头语义。
    history
        .create_table(&mut wb, 0, range("C4", "A1"), None)
        .unwrap();
    assert_eq!(wb.get_table("Table1").unwrap().range(), range("A1", "C4"));
    history.undo(&mut wb).unwrap();
    wb.define_table(Some("External"), 0, range("B3", "D5"), true)
        .unwrap();
    assert!(history.redo(&mut wb).is_err());
    assert!(wb.get_table("External").is_some());
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Null);
    wb.delete_table("External").unwrap();
    wb.sheet_mut(0)
        .unwrap()
        .restore_merged_ranges(vec![range("B2", "C2")])
        .unwrap();
    assert!(history.redo(&mut wb).is_err());
    assert_eq!(history.redo_count(), 1);
    wb.sheet_mut(0)
        .unwrap()
        .restore_merged_ranges(vec![])
        .unwrap();
    assert!(wb.rename_sheet(0, "Renamed"));
    assert!(history.redo(&mut wb).is_err());
    assert!(wb.get_table("Table1").is_none());
    assert_eq!(history.redo_count(), 1);
    assert!(wb.rename_sheet(0, "Sheet1"));
    history.redo(&mut wb).unwrap();
    assert!(wb.get_table("Table1").is_some());
}
