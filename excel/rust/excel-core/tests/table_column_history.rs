//! 列名、表头、消费者与撤销必须是一项原子操作，不能由 UI 分别写入。
use einfach_core::Value;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellFormat, CellRange, Workbook};

fn range(start: &str, end: &str) -> CellRange {
    CellRange::new(
        CellAddress::parse(start).unwrap(),
        CellAddress::parse(end).unwrap(),
    )
}
fn seed() -> (Workbook, WorkbookHistory) {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Text("Product".into()));
    wb.set_cell(0, "B1", Value::Text("Amount".into()));
    for row in 2..=4 {
        wb.set_cell(
            0,
            &format!("B{row}"),
            Value::Number((row - 1) as f64 * 10.0),
        );
    }
    wb.define_table(Some("Inventory"), 0, range("A1", "B4"), true)
        .unwrap();
    (wb, WorkbookHistory::default())
}
fn formula(wb: &Workbook, sheet: usize, address: &str) -> String {
    wb.sheet(sheet)
        .unwrap()
        .formula_text_at(CellAddress::parse(address).unwrap())
        .unwrap()
}

#[test]
fn header_totals_and_cross_sheet_arrays_rename_and_undo_together() {
    let (mut wb, mut history) = seed();
    wb.set_table_totals_row("Inventory", true).unwrap();
    wb.sheet_mut(0).unwrap().set_format(
        "B1",
        CellFormat {
            bold: true,
            ..Default::default()
        },
    );
    let other = wb.add_sheet("Other");
    let source = "= SUM(Inventory[Amount]) + 1";
    assert!(wb.set_formula(other, "A1", source));
    assert!(wb.set_formula(other, "D1", "=Inventory[#All]"));
    assert!(wb.set_formula(other, "H1", "=SUM(D1#)"));
    assert_eq!(wb.get_cell("Other", "A1"), Value::Number(61.0));
    assert_eq!(wb.get_cell("Other", "E1"), Value::Text("Amount".into()));
    assert_eq!(wb.get_cell("Other", "H1"), Value::Number(120.0));
    assert!(history
        .rename_table_column(&mut wb, "inventory", "amount", "Net Revenue")
        .unwrap());
    assert_eq!(history.undo_count(), 1);
    for _ in 0..3 {
        assert_eq!(
            wb.get_cell("Sheet1", "B1"),
            Value::Text("Net Revenue".into())
        );
        assert_eq!(
            wb.get_table("Inventory").unwrap().columns()[1],
            "Net Revenue"
        );
        assert_eq!(wb.get_cell("Sheet1", "B5"), Value::Number(60.0));
        assert!(formula(&wb, 0, "B5").contains("Inventory[Net Revenue]"));
        assert_eq!(
            wb.get_cell("Other", "E1"),
            Value::Text("Net Revenue".into())
        );
        assert_eq!(wb.get_cell("Other", "H1"), Value::Number(120.0));
        assert_eq!(wb.get_cell("Other", "A1"), Value::Number(61.0));
        assert!(wb.sheet(0).unwrap().get_format("B1").bold);
        history.undo(&mut wb).unwrap();
        assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Text("Amount".into()));
        assert_eq!(formula(&wb, other, "A1"), source);
        assert_eq!(wb.get_cell("Other", "E1"), Value::Text("Amount".into()));
        history.redo(&mut wb).unwrap();
    }
    wb.set_cell(0, "B2", Value::Number(40.0));
    assert_eq!(wb.get_cell("Other", "A1"), Value::Number(91.0));
    assert_eq!(wb.get_cell("Sheet1", "B5"), Value::Number(90.0));
}

#[test]
fn invalid_duplicate_and_unchanged_names_preserve_redo() {
    let (mut wb, mut history) = seed();
    history
        .rename_table_column(&mut wb, "Inventory", "Amount", "Net")
        .unwrap();
    history.undo(&mut wb).unwrap();
    let epoch = wb.tables_epoch();
    assert!(!history
        .rename_table_column(&mut wb, "Inventory", "amount", "Amount")
        .unwrap());
    for (name, old, next) in [
        ("Inventory", "Amount", " "),
        ("Inventory", "Amount", "pRoDuCt"),
        ("Inventory", "Missing", "Net"),
        ("Missing", "Amount", "Net"),
    ] {
        assert!(history
            .rename_table_column(&mut wb, name, old, next)
            .is_err());
        assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Text("Amount".into()));
        assert_eq!(history.redo_count(), 1);
        assert_eq!(wb.tables_epoch(), epoch);
    }
    history.redo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Text("Net".into()));
}

#[test]
fn a_formula_header_is_restored_exactly_without_a_second_formula_overwrite() {
    let (mut wb, mut history) = seed();
    let source = "= SUM(Inventory[Amount])";
    assert!(wb.set_formula(0, "B1", source));
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(60.0));
    history
        .rename_table_column(&mut wb, "Inventory", "Amount", "Total")
        .unwrap();
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Text("Total".into()));
    assert!(wb
        .sheet(0)
        .unwrap()
        .formula_text_at(CellAddress::parse("B1").unwrap())
        .is_none());
    history.undo(&mut wb).unwrap();
    assert_eq!(formula(&wb, 0, "B1"), source);
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(60.0));
    history.redo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Text("Total".into()));
}

#[test]
fn header_or_consumer_conflicts_reject_before_changing_anything() {
    let (mut wb, mut history) = seed();
    assert!(wb.set_formula(0, "D1", "=SUM(Inventory[Amount])"));
    history
        .rename_table_column(&mut wb, "Inventory", "Amount", "Net")
        .unwrap();
    let rewritten = formula(&wb, 0, "D1");
    wb.set_cell(0, "D1", Value::Number(999.0));
    let epoch = wb.tables_epoch();
    assert!(history.undo(&mut wb).is_err());
    assert_eq!(wb.tables_epoch(), epoch);
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Text("Net".into()));
    assert_eq!(history.undo_count(), 1);
    assert!(wb.set_formula(0, "D1", &rewritten));
    wb.set_cell(0, "B1", Value::Text("External".into()));
    assert!(history.undo(&mut wb).is_err());
    assert_eq!(wb.get_table("Inventory").unwrap().columns()[1], "Net");
    wb.set_cell(0, "B1", Value::Text("Net".into()));
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Text("Amount".into()));
}

#[test]
fn low_level_api_updates_headers_but_does_not_overwrite_headerless_data() {
    let (mut wb, _) = seed();
    wb.rename_table_column("Inventory", "Amount", " amount ")
        .unwrap();
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Text("amount".into()));
    wb.set_cell(0, "E1", Value::Text("Raw".into()));
    wb.define_table(Some("Headerless"), 0, range("E1", "E3"), false)
        .unwrap();
    wb.rename_table_column("Headerless", "Raw", "Data").unwrap();
    assert_eq!(wb.get_cell("Sheet1", "E1"), Value::Text("Raw".into()));
    assert_eq!(wb.get_table("Headerless").unwrap().columns()[0], "Data");
}

#[test]
fn column_name_escaping_uses_the_existing_parser_and_renderer() {
    let (mut wb, mut history) = seed();
    assert!(wb.set_formula(0, "D1", "=SUM(Inventory[Amount])"));
    history
        .rename_table_column(&mut wb, "Inventory", "Amount", "净额 [税] #@")
        .unwrap();
    assert_eq!(wb.get_cell("Sheet1", "D1"), Value::Number(60.0));
    assert_eq!(
        wb.get_cell("Sheet1", "B1"),
        Value::Text("净额 [税] #@".into())
    );
    history.undo(&mut wb).unwrap();
    assert_eq!(formula(&wb, 0, "D1"), "=SUM(Inventory[Amount])");
}

#[test]
fn merged_or_spilled_headers_reject_before_registry_or_history_changes() {
    for spilled in [false, true] {
        let (mut wb, mut history) = seed();
        if spilled {
            assert!(wb.set_formula(0, "B1", "=SEQUENCE(1,2)"));
        } else {
            wb.sheet_mut(0)
                .unwrap()
                .restore_merged_ranges(vec![range("B1", "C1")])
                .unwrap();
        }
        let original = wb.get_cell("Sheet1", "B1");
        let epoch = wb.tables_epoch();
        assert!(history
            .rename_table_column(&mut wb, "Inventory", "Amount", "Net")
            .is_err());
        assert_eq!(wb.get_table("Inventory").unwrap().columns()[1], "Amount");
        assert_eq!(wb.get_cell("Sheet1", "B1"), original);
        assert_eq!(wb.tables_epoch(), epoch);
        assert_eq!(history.undo_count(), 0);
    }
}

#[test]
fn subscribers_receive_one_complete_header_and_reference_change() {
    use std::{cell::Cell, rc::Rc};
    let (mut wb, mut history) = seed();
    let other = wb.add_sheet("Other");
    assert!(wb.set_formula(other, "D1", "=Sheet1!B1&\":\"&SUM(Inventory[Amount])"));
    let hits = Rc::new(Cell::new(0));
    let seen = hits.clone();
    let subscription = wb
        .sheet_mut(other)
        .unwrap()
        .subscribe_cell("D1", move || seen.set(seen.get() + 1));
    hits.set(0);
    history
        .rename_table_column(&mut wb, "Inventory", "Amount", "Net")
        .unwrap();
    assert_eq!(hits.replace(0), 1);
    assert_eq!(wb.get_cell("Other", "D1"), Value::Text("Net:60".into()));
    history.undo(&mut wb).unwrap();
    assert_eq!(hits.replace(0), 1);
    assert_eq!(wb.get_cell("Other", "D1"), Value::Text("Amount:60".into()));
    history.redo(&mut wb).unwrap();
    assert_eq!(hits.get(), 1);
    wb.sheet_mut(other).unwrap().unsubscribe_cell(subscription);
}
