//! 转换必须保留数据/格式，以普通地址继续计算，并由一次原生历史恢复表及源码。
use einfach_core::{Value, ValueError};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellFormat, CellRange, Workbook};

fn range(start: &str, end: &str) -> CellRange {
    CellRange::new(
        CellAddress::parse(start).unwrap(),
        CellAddress::parse(end).unwrap(),
    )
}
fn source(wb: &Workbook, sheet: usize, address: &str) -> String {
    wb.sheet(sheet)
        .unwrap()
        .formula_text_at(CellAddress::parse(address).unwrap())
        .unwrap()
}
fn seed() -> Workbook {
    let mut wb = Workbook::new();
    for (addr, value) in [("A1", "Qty"), ("B1", "Price"), ("C1", "Total")] {
        wb.set_cell(0, addr, Value::Text(value.into()));
    }
    wb.define_table(Some("Inventory"), 0, range("A1", "C4"), true)
        .unwrap();
    for row in 2..=4 {
        wb.set_cell(0, &format!("A{row}"), Value::Number((row - 1) as f64));
        wb.set_cell(
            0,
            &format!("B{row}"),
            Value::Number((row - 1) as f64 * 10.0),
        );
        wb.set_formula(0, &format!("C{row}"), "=[@Qty]*[@Price]");
    }
    wb.set_table_totals_row("Inventory", true).unwrap();
    wb.sheet_mut(0).unwrap().set_format(
        "C2",
        CellFormat {
            bold: true,
            font_size: Some(36),
            ..CellFormat::default()
        },
    );
    wb
}

#[test]
fn conversion_preserves_data_formats_and_total_formulas_with_exact_undo() {
    let mut wb = seed();
    let other = wb.add_sheet("Other");
    for (addr, formula) in [
        ("E1", "= SUM(Inventory[Qty]) "),
        ("E2", "=SUM(Inventory)"),
        ("E3", "=ROWS(Inventory[#All])"),
        ("E4", "=SUM(Inventory[#Totals])"),
        ("E5", "=Inventory[[#Headers],[Price]]"),
        ("E6", "=Inventory[@Qty]"),
        ("E7", "=SUM(Inventory[Missing])"),
    ] {
        assert!(wb.set_formula(0, addr, formula), "{addr}: {formula}");
    }
    wb.set_formula(other, "A1", "=Inventory[Price]");
    wb.set_formula(other, "D1", "=A1#");
    let addresses = [
        "C2", "C3", "C4", "C5", "E1", "E2", "E3", "E4", "E5", "E6", "E7",
    ];
    let before: Vec<_> = addresses.iter().map(|addr| source(&wb, 0, addr)).collect();
    let formats = wb
        .sheet(0)
        .unwrap()
        .snapshot_format_range(range("A1", "E7"));
    let mut history = WorkbookHistory::default();
    history
        .convert_table_to_range(&mut wb, "inventory")
        .unwrap();
    assert_eq!(history.undo_count(), 1);
    assert_eq!(
        history.entries().next().unwrap().affected_sheets(),
        vec![0, 1]
    );
    assert!(wb.get_table("Inventory").is_none());
    let converted = source(&wb, 0, "C2");
    assert!(!converted.contains('['));
    assert!(converted.contains("$A2"));
    for _ in 0..3 {
        for (addr, expected) in [
            ("C2", 10.0),
            ("C3", 40.0),
            ("C4", 90.0),
            ("C5", 140.0),
            ("E1", 6.0),
            ("E2", 206.0),
            ("E3", 5.0),
            ("E4", 140.0),
        ] {
            assert_eq!(
                wb.get_cell("Sheet1", addr),
                Value::Number(expected),
                "{addr}"
            );
        }
        assert_eq!(wb.get_cell("Sheet1", "E5"), Value::Text("Price".into()));
        assert_eq!(
            wb.get_cell("Sheet1", "E6"),
            Value::Error(ValueError::InvalidValue)
        );
        assert_eq!(
            wb.get_cell("Sheet1", "E7"),
            Value::Error(ValueError::InvalidRef)
        );
        assert_eq!(wb.get_cell("Other", "A3"), Value::Number(30.0));
        assert_eq!(wb.get_cell("Other", "D3"), Value::Number(30.0));
        assert_eq!(
            wb.sheet(0)
                .unwrap()
                .snapshot_format_range(range("A1", "E7")),
            formats
        );
        history.undo(&mut wb).unwrap();
        assert!(wb.get_table("Inventory").unwrap().has_totals());
        for (addr, original) in addresses.iter().zip(&before) {
            assert_eq!(&source(&wb, 0, addr), original);
        }
        history.redo(&mut wb).unwrap();
    }
    wb.set_cell(0, "A2", Value::Number(5.0));
    assert_eq!(wb.get_cell("Sheet1", "C2"), Value::Number(50.0));
    assert_eq!(wb.get_cell("Sheet1", "E1"), Value::Number(10.0));
    assert_eq!(wb.get_cell("Sheet1", "C5"), Value::Number(180.0));
    history.undo(&mut wb).unwrap();
    assert_eq!(
        wb.get_cell("Sheet1", "A2"),
        Value::Number(5.0),
        "undo must not restore a stale data snapshot"
    );
}

#[test]
fn free_names_convert_but_local_bindings_text_and_other_tables_do_not() {
    let mut wb = seed();
    wb.define_table(Some("OtherTable"), 0, range("H1", "I3"), true)
        .unwrap();
    let local = "=LET(Inventory,7,Inventory+SUM(Inventory[Qty]))";
    wb.set_formula(0, "E1", local);
    wb.set_formula(0, "E2", "=LAMBDA(Inventory,Inventory+1)(8)");
    wb.set_formula(0, "E3", "=IF(\"Inventory\"=\"x\",0,SUM(Inventory[Qty]))");
    wb.set_formula(0, "E4", "=ROWS(OtherTable)");
    assert!(wb.set_formula(0, "H2", "=[@Column2]+1"));
    let unrelated = source(&wb, 0, "H2");
    let mut history = WorkbookHistory::default();
    history
        .convert_table_to_range(&mut wb, "Inventory")
        .unwrap();
    for (addr, expected) in [("E1", 13.0), ("E2", 9.0), ("E3", 6.0), ("E4", 2.0)] {
        assert_eq!(
            wb.get_cell("Sheet1", addr),
            Value::Number(expected),
            "{addr}"
        );
    }
    assert_eq!(source(&wb, 0, "H2"), unrelated);
    assert!(source(&wb, 0, "E3").contains("\"Inventory\""));
    history.undo(&mut wb).unwrap();
    assert_eq!(source(&wb, 0, "E1"), local);
    assert!(wb.get_table("OtherTable").is_some());
}

#[test]
fn invalid_commands_external_formula_edits_and_conflicting_tables_do_not_partially_restore() {
    let mut wb = seed();
    wb.set_formula(0, "E1", "=SUM(Inventory[Qty])");
    let mut history = WorkbookHistory::default();
    assert!(history.convert_table_to_range(&mut wb, "Missing").is_err());
    history
        .convert_table_to_range(&mut wb, "Inventory")
        .unwrap();
    let converted = source(&wb, 0, "E1");
    wb.set_formula(0, "E1", "=99");
    assert!(history.undo(&mut wb).is_err());
    assert!(wb.get_table("Inventory").is_none());
    wb.set_formula(0, "E1", &converted);
    wb.define_table(Some("Conflicting"), 0, range("A1", "B4"), true)
        .unwrap();
    assert!(history.undo(&mut wb).is_err());
    assert!(wb.get_table("Conflicting").is_some());
    assert_eq!(history.undo_count(), 1);
    wb.delete_table("Conflicting").unwrap();
    history.undo(&mut wb).unwrap();
    assert!(history.convert_table_to_range(&mut wb, "Missing").is_err());
    assert_eq!(history.redo_count(), 1);
    history.redo(&mut wb).unwrap();
    assert!(wb.get_table("Inventory").is_none());
}
