//! 创建/撤销表定义时，数组消费者必须同步更新 spill 几何而非只改变锚点值。
use einfach_core::{Value, ValueError};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, Workbook};

#[test]
fn generated_table_name_spills_when_its_formula_is_bulk_loaded() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    history
        .create_table(
            &mut wb,
            0,
            CellRange::new(CellAddress::new(0, 0), CellAddress::new(2, 0)),
            None,
        )
        .unwrap();
    assert!(wb.get_table("Table1").is_some());
    wb.set_cell(0, "A3", Value::Number(20.0));
    let other = wb.add_sheet("Other");
    wb.install_sheet_bulk(
        other,
        Default::default(),
        [(CellAddress::new(0, 0), "=Table1".to_owned())]
            .into_iter()
            .collect(),
    )
    .unwrap();
    assert_eq!(
        wb.sheet(other).unwrap().spill_info(CellAddress::new(0, 0)),
        Some((2, 1))
    );
    assert_eq!(wb.get_cell("Other", "A2"), Value::Number(20.0));
}

#[test]
fn existing_structured_arrays_and_spill_consumers_follow_create_undo_redo() {
    let mut wb = Workbook::new();
    let other = wb.add_sheet("Other");
    wb.set_cell(0, "A1", Value::Text("Amount".into()));
    wb.set_cell(0, "A2", Value::Number(10.0));
    wb.set_cell(0, "A3", Value::Number(20.0));
    wb.set_formula(0, "D1", "=Inventory[Amount]");
    wb.set_formula(other, "A1", "=Sheet1!D1#");
    wb.set_formula(other, "D1", "=Inventory[Amount]");
    wb.set_formula(other, "G1", "=Inventory");
    wb.set_formula(other, "J1", "=SUM(Inventory)");
    let mut history = WorkbookHistory::default();
    history
        .create_table(
            &mut wb,
            0,
            CellRange::new(CellAddress::new(0, 0), CellAddress::new(2, 0)),
            Some("Inventory"),
        )
        .unwrap();
    for _ in 0..3 {
        assert_eq!(wb.get_cell("Other", "J1"), Value::Number(30.0));
        for (sheet, child) in [
            ("Sheet1", "D2"),
            ("Other", "A2"),
            ("Other", "D2"),
            ("Other", "G2"),
        ] {
            assert_eq!(
                wb.get_cell(sheet, child),
                Value::Number(20.0),
                "{sheet}!{child}"
            );
        }
        history.undo(&mut wb).unwrap();
        assert_eq!(
            wb.get_cell("Sheet1", "D1"),
            Value::Error(ValueError::InvalidName)
        );
        assert_eq!(
            wb.get_cell("Other", "J1"),
            Value::Error(ValueError::InvalidName)
        );
        for (sheet, child) in [
            ("Sheet1", "D2"),
            ("Other", "A2"),
            ("Other", "D2"),
            ("Other", "G2"),
        ] {
            assert_eq!(wb.get_cell(sheet, child), Value::Null, "{sheet}!{child}");
        }
        history.redo(&mut wb).unwrap();
    }
}

#[test]
fn bare_table_names_share_data_geometry_but_do_not_capture_local_or_named_values() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(100.0));
    wb.set_cell(0, "A2", Value::Number(10.0));
    wb.set_cell(0, "A3", Value::Number(20.0));
    let mut history = WorkbookHistory::default();
    history
        .create_table(
            &mut wb,
            0,
            CellRange::new(CellAddress::new(0, 0), CellAddress::new(2, 0)),
            Some("Inventory"),
        )
        .unwrap();
    wb.define_name_value("Scalar", Value::Number(7.0)).unwrap();
    for (formula, expected) in [
        ("=SUM(inventory)", 30.0),
        ("=ROWS(Inventory)", 2.0),
        ("=SUM(OFFSET(Inventory,0,0,1,1))", 10.0),
        ("=SUM(OFFSET(Inventory,0,0))", 30.0),
        ("=SUM(OFFSET(A2:A3,0,0))", 30.0),
        ("=ROWS(OFFSET(Inventory,0,0))", 2.0),
        ("=LET(Inventory,7,SUM(Inventory))", 7.0),
        ("=LAMBDA(Inventory,SUM(Inventory))(8)", 8.0),
        ("=Scalar", 7.0),
    ] {
        assert!(wb.set_formula(0, "D1", formula));
        assert_eq!(
            wb.get_cell("Sheet1", "D1"),
            Value::Number(expected),
            "{formula}"
        );
    }
    for formula in [
        "=SUM(OFFSET(Inventory,-2,0))",
        "=SUM(OFFSET(Inventory,1048575,0))",
        "=SUM(OFFSET(Inventory,0,16384))",
        "=SUM(OFFSET(Inventory,1E99,0))",
        "=SUM(OFFSET(Inventory,0,0,0.5,1))",
    ] {
        wb.set_formula(0, "D1", formula);
        assert_eq!(
            wb.get_cell("Sheet1", "D1"),
            Value::Error(ValueError::InvalidRef),
            "{formula}"
        );
    }
}
