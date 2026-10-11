//! Table 转普通区域后，闭包仍按调用位置取行；不冻结成定义时的值。
use einfach_core::{Value, ValueError};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, Workbook};

fn range(start: &str, end: &str) -> CellRange {
    CellRange::new(
        CellAddress::parse(start).unwrap(),
        CellAddress::parse(end).unwrap(),
    )
}

fn seed() -> Workbook {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Text("Amount".into()));
    wb.set_cell(0, "A2", Value::Number(10.0));
    wb.set_cell(0, "A3", Value::Number(20.0));
    wb.define_table(Some("Inventory"), 0, range("A1", "B3"), true)
        .unwrap();
    wb
}

#[test]
fn qualified_saved_returned_and_captured_lambdas_use_the_callers_row() {
    let mut wb = seed();
    for (name, formula) in [
        ("Caller", "=LAMBDA(Inventory[@Amount])"),
        ("Returned", "=LAMBDA(LAMBDA(Inventory[@Amount]))"),
        (
            "Captured",
            "=LET(fn,LAMBDA(Inventory[@Amount]),LAMBDA(fn()))",
        ),
        ("Height", "=LAMBDA(ROWS(Inventory[@Amount]))"),
        ("Missing", "=LAMBDA(Inventory[@Missing])"),
    ] {
        wb.define_name(name, formula).unwrap();
    }
    let original = wb.get_named("Caller");
    let other = wb.add_sheet("Other");
    for sheet in [0, other] {
        for (addr, formula) in [
            ("D1", "=Caller()"),
            ("D2", "=Caller()"),
            ("D3", "=Caller()"),
            ("D4", "=Caller()"),
            ("E2", "=Returned()()"),
            ("E3", "=Captured()"),
            ("F2", "=LAMBDA(ROW,Inventory[@Amount]+ROW)(7)"),
            ("F3", "=Height()"),
            ("G1", "=Missing()"),
            ("G2", "=Missing()"),
        ] {
            assert!(wb.set_formula(sheet, addr, formula), "{formula}");
        }
    }
    let mut history = WorkbookHistory::default();
    history
        .convert_table_to_range(&mut wb, "Inventory")
        .unwrap();
    for _ in 0..3 {
        for sheet in ["Sheet1", "Other"] {
            for (addr, expected) in [
                ("D2", 10.0),
                ("D3", 20.0),
                ("E2", 10.0),
                ("E3", 20.0),
                ("F2", 17.0),
                ("F3", 1.0),
            ] {
                assert_eq!(
                    wb.get_cell(sheet, addr),
                    Value::Number(expected),
                    "{sheet}!{addr}"
                );
            }
            for addr in ["D1", "D4", "G1"] {
                assert_eq!(
                    wb.get_cell(sheet, addr),
                    Value::Error(ValueError::InvalidValue),
                    "{addr}"
                );
            }
            assert_eq!(
                wb.get_cell(sheet, "G2"),
                Value::Error(ValueError::InvalidRef)
            );
        }
        history.undo(&mut wb).unwrap();
        assert_eq!(wb.get_named("Caller"), original);
        history.redo(&mut wb).unwrap();
    }
    wb.set_cell(0, "A3", Value::Number(90.0));
    assert_eq!(wb.get_cell("Other", "D3"), Value::Number(90.0));
    assert_eq!(wb.get_cell("Other", "E3"), Value::Number(90.0));
}

#[test]
fn unqualified_closures_follow_other_tables_outside_the_converted_region() {
    let mut wb = seed();
    wb.set_cell(0, "D1", Value::Text("Amount".into()));
    wb.set_cell(0, "D2", Value::Number(50.0));
    wb.set_cell(0, "D3", Value::Number(60.0));
    wb.define_table(Some("OtherTable"), 0, range("D1", "E3"), true)
        .unwrap();
    let other = wb.add_sheet("Other");
    wb.set_cell(other, "A1", Value::Text("Amount".into()));
    wb.set_cell(other, "A2", Value::Number(70.0));
    wb.define_table(Some("Remote"), other, range("A1", "B3"), true)
        .unwrap();
    wb.define_name("Caller", "=LAMBDA([@Amount])").unwrap();
    wb.define_name("Total", "=LAMBDA(SUM([Amount]))").unwrap();
    for (sheet, addr, formula) in [
        (0, "B2", "=Caller()"),
        (0, "B3", "=Total()"),
        (0, "E2", "=Caller()"),
        (0, "E3", "=Total()"),
        (other, "B2", "=Caller()"),
        (0, "G2", "=Caller()"),
    ] {
        assert!(wb.set_formula(sheet, addr, formula));
    }
    let mut history = WorkbookHistory::default();
    history
        .convert_table_to_range(&mut wb, "Inventory")
        .unwrap();
    for _ in 0..2 {
        assert_eq!(wb.get_cell("Sheet1", "B2"), Value::Number(10.0));
        assert_eq!(wb.get_cell("Sheet1", "B3"), Value::Number(30.0));
        assert_eq!(wb.get_cell("Sheet1", "E2"), Value::Number(50.0));
        assert_eq!(wb.get_cell("Sheet1", "E3"), Value::Number(110.0));
        assert_eq!(wb.get_cell("Other", "B2"), Value::Number(70.0));
        assert_eq!(
            wb.get_cell("Sheet1", "G2"),
            Value::Error(ValueError::InvalidValue)
        );
        history.undo(&mut wb).unwrap();
        history.redo(&mut wb).unwrap();
    }
    // 再转换第二个表，分支组合仍只依赖普通地址，不改变前一次转换的含义。
    history
        .convert_table_to_range(&mut wb, "OtherTable")
        .unwrap();
    wb.set_cell(0, "D3", Value::Number(80.0));
    assert_eq!(wb.get_cell("Sheet1", "E3"), Value::Number(130.0));
    assert_eq!(wb.get_cell("Sheet1", "B3"), Value::Number(30.0));
    assert_eq!(wb.get_cell("Other", "B2"), Value::Number(70.0));
}

#[test]
fn conditional_references_stay_references_and_do_not_evaluate_the_other_branch() {
    let mut wb = seed();
    for (addr, formula, expected) in [
        ("D1", "=SUM(IF(TRUE,A2:A3,#REF!))", 30.0),
        ("D2", "=ROWS(IF(FALSE,#REF!,A2:A3))", 2.0),
        ("D3", "=SUM(OFFSET(IF(TRUE,A2:A3,#REF!),0,0))", 30.0),
        ("D4", "=INDEX(IF(FALSE,#REF!,A2:A3),2)", 20.0),
    ] {
        assert!(wb.set_formula(0, addr, formula));
        assert_eq!(
            wb.get_cell("Sheet1", addr),
            Value::Number(expected),
            "{formula}"
        );
    }
}

#[test]
fn converted_closures_follow_structural_edits_and_their_history() {
    let mut wb = seed();
    wb.define_name("Caller", "=LAMBDA(Inventory[@Amount])")
        .unwrap();
    wb.define_name("Whole", "=LAMBDA(Inventory[Amount])")
        .unwrap();
    assert!(wb.set_formula(0, "D3", "=Caller()"));
    let other = wb.add_sheet("Other");
    assert!(wb.set_formula(other, "H1", "=Whole()"));
    let mut history = WorkbookHistory::default();
    history
        .convert_table_to_range(&mut wb, "Inventory")
        .unwrap();
    let converted = wb.get_named("Caller");
    assert_eq!(wb.get_cell("Sheet1", "D3"), Value::Number(20.0));
    assert_eq!(wb.get_cell("Other", "H2"), Value::Number(20.0));
    history
        .edit_structure(
            &mut wb,
            0,
            einfach_excel_core::shift::ShiftEdit::RowInsert { at: 2, count: 1 },
        )
        .unwrap();
    for _ in 0..2 {
        assert_eq!(wb.get_cell("Sheet1", "D4"), Value::Number(20.0));
        assert_eq!(wb.get_cell("Other", "H3"), Value::Number(20.0));
        history.undo(&mut wb).unwrap();
        assert_eq!(wb.get_named("Caller"), converted);
        assert_eq!(wb.get_cell("Sheet1", "D3"), Value::Number(20.0));
        assert_eq!(wb.get_cell("Other", "H2"), Value::Number(20.0));
        assert_eq!(wb.get_cell("Other", "H3"), Value::Null);
        history.redo(&mut wb).unwrap();
    }
    wb.define_name("Caller", "=LAMBDA(99)").unwrap();
    assert!(
        history.undo(&mut wb).is_err(),
        "do not overwrite an externally edited closure"
    );
    assert_eq!(wb.get_cell("Sheet1", "A4"), Value::Number(20.0));
    assert_eq!(wb.get_cell("Other", "H3"), Value::Number(20.0));
}

#[test]
fn deleting_a_boundary_row_shrinks_the_converted_closure_range() {
    for (deleted, caller, expected) in [(1, "D3", 20.0), (2, "D2", 10.0)] {
        let mut wb = seed();
        wb.define_name("Caller", "=LAMBDA(Inventory[@Amount])")
            .unwrap();
        assert!(wb.set_formula(0, caller, "=Caller()"));
        WorkbookHistory::default()
            .convert_table_to_range(&mut wb, "Inventory")
            .unwrap();
        wb.delete_rows(0, deleted, 1);
        assert_eq!(wb.get_cell("Sheet1", "D2"), Value::Number(expected));
    }
}
