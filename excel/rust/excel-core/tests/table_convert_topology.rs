//! 转换后的闭包引用随工作表拓扑变化，撤销恢复原闭包而不是重新捕获。
use einfach_core::{Value, ValueError};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, Workbook};

fn seed() -> (Workbook, WorkbookHistory) {
    let mut wb = Workbook::new();
    wb.add_sheet("Other");
    wb.set_cell(0, "A1", Value::Text("Amount".into()));
    wb.set_cell(0, "A2", Value::Number(10.0));
    wb.set_cell(0, "A3", Value::Number(20.0));
    let range = CellRange::new(CellAddress::new(0, 0), CellAddress::new(2, 1));
    wb.define_table(Some("Inventory"), 0, range, true).unwrap();
    for (name, formula) in [
        ("Caller", "=LAMBDA(Inventory[@Amount])"),
        ("Whole", "=LAMBDA(Inventory[Amount])"),
        (
            "Captured",
            "=LET(fn,LAMBDA(Inventory[@Amount]),LAMBDA(fn()))",
        ),
        ("Bare", "=LAMBDA([@Amount])"),
    ] {
        wb.define_name(name, formula).unwrap();
    }
    for (sheet, addr, formula) in [
        (0, "B2", "=Bare()"),
        (1, "D3", "=Caller()"),
        (1, "E3", "=Captured()"),
        (1, "H1", "=Whole()"),
    ] {
        assert!(wb.set_formula(sheet, addr, formula));
    }
    let mut history = WorkbookHistory::default();
    history
        .convert_table_to_range(&mut wb, "Inventory")
        .unwrap();
    (wb, history)
}

#[track_caller]
fn assert_live(wb: &Workbook, source: &str) {
    assert_eq!(wb.get_cell(source, "B2"), Value::Number(10.0));
    assert_eq!(wb.get_cell("Other", "D3"), Value::Number(20.0));
    assert_eq!(wb.get_cell("Other", "E3"), Value::Number(20.0));
    assert_eq!(wb.get_cell("Other", "H2"), Value::Number(20.0));
}

#[test]
fn rename_restores_exact_closures_and_preserves_preexisting_missing_sheet_refs() {
    let (mut wb, mut history) = seed();
    wb.define_name("Future", "=LAMBDA('New Name'!A2)").unwrap();
    assert!(wb.set_formula(1, "J1", "=Future()"));
    let future = wb.get_named("Future");
    let converted = wb.get_named("Caller");
    assert_live(&wb, "Sheet1");
    history.edit_sheet(&mut wb, Some(0), "New Name").unwrap();
    let renamed = wb.get_named("Caller");
    for _ in 0..3 {
        assert_live(&wb, "New Name");
        assert_eq!(wb.get_named("Future"), future);
        assert_eq!(wb.get_cell("Other", "J1"), Value::Number(10.0));
        history.undo(&mut wb).unwrap();
        assert_live(&wb, "Sheet1");
        assert_eq!(wb.get_named("Caller"), converted);
        assert_eq!(wb.get_named("Future"), future);
        history.redo(&mut wb).unwrap();
        assert_eq!(wb.get_named("Caller"), renamed);
    }
    history.undo(&mut wb).unwrap();
    history.undo(&mut wb).unwrap(); // 精确闭包身份使前一次 Table 转换仍可撤销。
    assert_live(&wb, "Sheet1");
    history.redo(&mut wb).unwrap();
    history.redo(&mut wb).unwrap();
    wb.set_cell(0, "A3", Value::Number(90.0));
    assert_eq!(wb.get_cell("Other", "D3"), Value::Number(90.0));
    assert_eq!(wb.get_cell("Other", "H2"), Value::Number(90.0));
}

#[test]
fn deletion_clears_spills_and_archive_restores_exact_closures() {
    let (mut wb, mut history) = seed();
    let converted = wb.get_named("Caller");
    let key = wb.sheet_key(0);
    assert_live(&wb, "Sheet1");
    history.remove_sheet(&mut wb, 0).unwrap();
    for _ in 0..3 {
        for addr in ["D3", "E3", "H1"] {
            assert_eq!(
                wb.get_cell("Other", addr),
                Value::Error(ValueError::InvalidRef),
                "{addr}"
            );
        }
        assert_eq!(wb.get_cell("Other", "H2"), Value::Null);
        history.undo(&mut wb).unwrap();
        assert_eq!(wb.sheet_key(0), key);
        assert_eq!(wb.get_named("Caller"), converted);
        assert_live(&wb, "Sheet1");
        history.redo(&mut wb).unwrap();
    }
    history.undo(&mut wb).unwrap();
    history.undo(&mut wb).unwrap();
    assert_live(&wb, "Sheet1");
}

#[test]
fn external_lambda_edits_reject_rename_and_delete_undo_before_writes() {
    for remove in [false, true] {
        let (mut wb, mut history) = seed();
        if remove {
            history.remove_sheet(&mut wb, 0).unwrap();
        } else {
            history.edit_sheet(&mut wb, Some(0), "Renamed").unwrap();
        }
        let expected = wb.get_named("Caller").unwrap();
        wb.define_name("Caller", "=LAMBDA(99)").unwrap();
        let edited = wb.get_named("Caller");
        let count = history.undo_count();
        for _ in 0..2 {
            assert!(history.undo(&mut wb).is_err());
            assert_eq!(history.undo_count(), count);
            assert_eq!(wb.sheet_count(), if remove { 1 } else { 2 });
            assert_eq!(wb.name(0), Some(if remove { "Other" } else { "Renamed" }));
            assert_eq!(wb.get_named("Caller"), edited);
        }
        wb.define_name_value("Caller", expected).unwrap();
        history.undo(&mut wb).unwrap();
        assert_live(&wb, "Sheet1");
    }
}

#[test]
fn direct_topology_commands_preserve_converted_lambda_consumers() {
    let (mut wb, _) = seed();
    assert_live(&wb, "Sheet1");
    assert!(wb.rename_sheet(0, "Renamed"));
    assert_live(&wb, "Renamed");
    assert!(wb.move_sheet(0, 1));
    assert_live(&wb, "Renamed");
    let converted = wb.get_named("Caller");
    let archive = wb.archive_sheet(1).unwrap();
    assert_eq!(
        wb.get_cell("Other", "D3"),
        Value::Error(ValueError::InvalidRef)
    );
    assert_eq!(wb.get_cell("Other", "H2"), Value::Null);
    archive.restore(&mut wb).unwrap();
    assert_eq!(wb.get_named("Caller"), converted);
    assert_live(&wb, "Renamed");
    wb.remove_sheet(1).unwrap();
    assert_eq!(
        wb.get_cell("Other", "E3"),
        Value::Error(ValueError::InvalidRef)
    );
}

#[test]
fn undoing_sheet_creation_preserves_missing_reference_lambda_identity() {
    let mut wb = Workbook::new();
    wb.define_name("Future", "=LAMBDA(FutureSheet!A1)").unwrap();
    let original = wb.get_named("Future");
    wb.set_formula(0, "A1", "=Future()");
    let mut history = WorkbookHistory::default();
    let index = history.edit_sheet(&mut wb, None, "FutureSheet").unwrap();
    wb.set_cell(index, "A1", Value::Number(42.0));
    for _ in 0..3 {
        assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(42.0));
        history.undo(&mut wb).unwrap();
        assert_eq!(wb.get_named("Future"), original);
        history.redo(&mut wb).unwrap();
    }
}
