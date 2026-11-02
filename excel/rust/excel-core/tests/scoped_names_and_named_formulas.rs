//! Comprehensive tests for Sheet-Scoped Defined Names & Named Formulas (Item #27).

use einfach_core::{Value, ValueError};
use einfach_excel_core::workbook::{NamedRangeAction, NamedRangeSnapshot, WorkbookError};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, Workbook};

#[test]
fn sheet_scoped_and_workbook_scoped_names_coexist_and_resolve_with_precedence() {
    let mut wb = Workbook::new();
    let s2 = wb.add_sheet("Sheet2");
    let s3 = wb.add_sheet("Sales Q1");

    // Same name in Workbook scope, Sheet1 scope, and Sheet2 scope simultaneously.
    wb.define_named_formula("TaxRate", None, "=0.05").unwrap();
    wb.define_named_formula("TaxRate", Some(0), "=0.10").unwrap();
    wb.define_named_formula("TaxRate", Some(s2), "=0.20").unwrap();

    // Unqualified TaxRate on Sheet1 -> 0.10 (Sheet1 scope)
    wb.set_formula(0, "A1", "=TaxRate*100");
    // Unqualified TaxRate on Sheet2 -> 0.20 (Sheet2 scope)
    wb.set_formula(s2, "A1", "=TaxRate*100");
    // Unqualified TaxRate on 'Sales Q1' -> falls back to Workbook scope (0.05)
    wb.set_formula(s3, "A1", "=TaxRate*100");

    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(10.0));
    assert_eq!(wb.get_cell("Sheet2", "A1"), Value::Number(20.0));
    assert_eq!(wb.get_cell("Sales Q1", "A1"), Value::Number(5.0));

    // Sheet-qualified references: Sheet1!TaxRate, Sheet2!TaxRate, 'Sales Q1'!TaxRate
    wb.set_formula(s3, "B1", "=Sheet1!TaxRate + Sheet2!TaxRate + 'Sales Q1'!TaxRate");
    assert_eq!(wb.get_cell("Sales Q1", "B1"), Value::Number(0.35000000000000003));
}

#[test]
fn sheet_scoped_named_ranges_and_sheet_qualified_range_references_work() {
    let mut wb = Workbook::new();
    let s2 = wb.add_sheet("Sales Q1");

    wb.set_cell(0, "A1", Value::Number(10.0));
    wb.set_cell(0, "A2", Value::Number(20.0));
    wb.set_cell(s2, "A1", Value::Number(100.0));
    wb.set_cell(s2, "A2", Value::Number(200.0));

    let range = CellRange::new(CellAddress::new(0, 0), CellAddress::new(1, 0));
    wb.define_scoped_named_range("Items", None, 0, range).unwrap();
    wb.define_scoped_named_range("Items", Some(s2), s2, range).unwrap();

    // Unqualified Items on Sheet1 uses Workbook-scoped Items (30)
    wb.set_formula(0, "B1", "=SUM(Items)");
    // Unqualified Items on 'Sales Q1' uses 'Sales Q1'-scoped Items (300)
    wb.set_formula(s2, "B1", "=SUM(Items)");
    // Sheet-qualified 'Sales Q1'!Items on Sheet1 uses 'Sales Q1'-scoped Items (300)
    wb.set_formula(0, "B2", "=SUM('Sales Q1'!Items)");

    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(30.0));
    assert_eq!(wb.get_cell("Sales Q1", "B1"), Value::Number(300.0));
    assert_eq!(wb.get_cell("Sheet1", "B2"), Value::Number(300.0));
}

#[test]
fn named_formulas_evaluate_dynamically_and_track_store_dependencies() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(10.0));
    wb.set_cell(0, "A2", Value::Number(20.0));
    wb.set_cell(0, "B1", Value::Number(5.0));

    wb.define_named_formula(" BoostedTotal ", None, "=SUM(Sheet1!$A$1:$A$2)*1.1")
        .unwrap_err(); // invalid name with spaces
    wb.define_named_formula("BoostedTotal", None, "=SUM(Sheet1!$A$1:$A$2)*1.5")
        .unwrap();
    wb.define_named_formula("LocalSum", Some(0), "=$A$1+$B$1")
        .unwrap();

    wb.set_formula(0, "C1", "=BoostedTotal");
    wb.set_formula(0, "C2", "=LocalSum*2");
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(45.0));
    assert_eq!(wb.get_cell("Sheet1", "C2"), Value::Number(30.0));

    // Mutate underlying cells: Named Formula dependents must reactively recompute!
    wb.set_cell(0, "A1", Value::Number(30.0));
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(75.0));
    assert_eq!(wb.get_cell("Sheet1", "C2"), Value::Number(70.0));
}

#[test]
fn named_formulas_detect_cycles_with_cells_and_between_names() {
    let mut wb = Workbook::new();
    wb.define_named_formula("MirrorA1", None, "=Sheet1!$A$1+1")
        .unwrap();
    wb.set_formula(0, "A1", "=MirrorA1");
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Error(ValueError::CyclicRef));

    // Self-referential and mutually recursive named formulas surface #CYCLE!
    wb.define_named_formula("Ping", None, "=Pong+1").unwrap();
    wb.define_named_formula("Pong", None, "=Ping+1").unwrap();
    wb.set_formula(0, "B1", "=Ping");
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Error(ValueError::CyclicRef));
}

#[test]
fn structural_edits_and_sheet_renames_rewrite_named_formulas_and_scoped_ranges() {
    let mut wb = Workbook::new();
    let s2 = wb.add_sheet("Data");
    wb.set_cell(s2, "A1", Value::Number(10.0));
    wb.set_cell(s2, "A2", Value::Number(20.0));

    wb.define_named_formula("ScaledData", None, "=SUM(Data!$A$1:$A$2)*2")
        .unwrap();
    wb.define_named_formula("LocalData", Some(s2), "=$A$1+$A$2")
        .unwrap();
    wb.set_formula(0, "A1", "=ScaledData + Data!LocalData");
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(90.0));

    // Insert a row at the top of Data -> shifts $A$1:$A$2 to $A$2:$A$3 in both named formulas!
    let mut history = WorkbookHistory::default();
    history
        .edit_structure(
            &mut wb,
            s2,
            einfach_excel_core::shift::ShiftEdit::RowInsert { at: 0, count: 1 },
        )
        .unwrap();
    assert_eq!(
        wb.get_named_formula(None, "ScaledData"),
        Some("=(SUM(Data!$A$2:$A$3)*2)")
    );
    assert_eq!(
        wb.get_named_formula(Some(s2), "LocalData"),
        Some("=($A$2+$A$3)")
    );
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(90.0));

    // Rename worksheet Data -> Metrics: rewrites both named formula and cell formula Data!LocalData!
    history.edit_sheet(&mut wb, Some(s2), "Metrics").unwrap();
    assert_eq!(
        wb.get_named_formula(None, "ScaledData"),
        Some("=(SUM(Metrics!$A$2:$A$3)*2)")
    );
    assert_eq!(
        wb.sheet(0).unwrap().get_formula("A1").as_deref(),
        Some("=(ScaledData+Metrics!LocalData)")
    );
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(90.0));

    // Undo rename and row insert
    history.undo(&mut wb).unwrap();
    assert_eq!(
        wb.get_named_formula(None, "ScaledData"),
        Some("=(SUM(Data!$A$2:$A$3)*2)")
    );
    history.undo(&mut wb).unwrap();
    assert_eq!(
        wb.get_named_formula(None, "ScaledData"),
        Some("=SUM(Data!$A$1:$A$2)*2")
    );
    assert_eq!(
        wb.get_named_formula(Some(s2), "LocalData"),
        Some("=$A$1+$A$2")
    );
}

#[test]
fn sheet_reorder_delete_and_undo_preserve_sheet_scoped_names() {
    let mut wb = Workbook::new();
    let s2 = wb.add_sheet("Second");
    wb.define_named_formula("TaxRate", Some(s2), "=0.25").unwrap();
    wb.set_formula(0, "A1", "=Second!TaxRate");
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(0.25));

    // Move Second to index 0 -> scope follows stable sheet_key!
    let mut history = WorkbookHistory::default();
    history.move_sheet(&mut wb, s2, 0).unwrap();
    assert_eq!(wb.get_named_formula(Some(0), "TaxRate"), Some("=0.25"));
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(0.25));

    // Delete Second (now at index 0) -> removes its sheet-scoped names, and undo restores them!
    history.remove_sheet(&mut wb, 0).unwrap();
    assert!(wb.snapshot_named_ranges().is_empty());
    assert_eq!(
        wb.get_cell("Sheet1", "A1"),
        Value::Error(ValueError::InvalidRef)
    );

    history.undo(&mut wb).unwrap();
    assert_eq!(wb.get_named_formula(Some(0), "TaxRate"), Some("=0.25"));
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(0.25));
}

#[test]
fn history_change_named_range_supports_scoped_names_formulas_and_renaming() {
    let mut wb = Workbook::new();
    let s2 = wb.add_sheet("Sheet2");
    wb.set_cell(s2, "A1", Value::Number(50.0));
    let mut history = WorkbookHistory::default();

    // Create sheet-scoped named formula on Sheet2
    history
        .change_named_range(
            &mut wb,
            s2,
            NamedRangeAction::CreateScoped {
                name: "Bonus".into(),
                scope: Some(s2),
                target: None,
                formula: Some("=$A$1*0.1".into()),
            },
        )
        .unwrap();
    wb.set_formula(s2, "B1", "=Bonus");
    wb.set_formula(0, "B1", "=Sheet2!Bonus");
    assert_eq!(wb.get_cell("Sheet2", "B1"), Value::Number(5.0));
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(5.0));

    // Duplicate within same scope fails
    let err = history.change_named_range(
        &mut wb,
        s2,
        NamedRangeAction::CreateScoped {
            name: "bonus".into(),
            scope: Some(s2),
            target: None,
            formula: Some("=1".into()),
        },
    );
    assert_eq!(err, Err("The name is already in use."));

    // Same name in Workbook scope succeeds!
    history
        .change_named_range(
            &mut wb,
            0,
            NamedRangeAction::CreateScoped {
                name: "Bonus".into(),
                scope: None,
                target: None,
                formula: Some("=99".into()),
            },
        )
        .unwrap();
    wb.set_formula(0, "B2", "=Bonus");
    assert_eq!(wb.get_cell("Sheet1", "B2"), Value::Number(99.0));
    assert_eq!(wb.get_cell("Sheet2", "B1"), Value::Number(5.0));

    // Rename Sheet2's Bonus -> ExtraBonus: rewrites Sheet2's =Bonus and Sheet1's =Sheet2!Bonus,
    // while leaving Sheet1's workbook-scoped =Bonus untouched!
    history
        .change_named_range(
            &mut wb,
            s2,
            NamedRangeAction::UpdateScoped {
                name: "Bonus".into(),
                scope: Some(s2),
                new_name: "ExtraBonus".into(),
                new_scope: None,
                target: None,
                formula: None,
            },
        )
        .unwrap();
    assert_eq!(
        wb.sheet(s2).unwrap().get_formula("B1").as_deref(),
        Some("=ExtraBonus")
    );
    assert_eq!(
        wb.sheet(0).unwrap().get_formula("B1").as_deref(),
        Some("=Sheet2!ExtraBonus")
    );
    assert_eq!(
        wb.sheet(0).unwrap().get_formula("B2").as_deref(),
        Some("=Bonus")
    );
    assert_eq!(wb.get_cell("Sheet2", "B1"), Value::Number(5.0));
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(5.0));
    assert_eq!(wb.get_cell("Sheet1", "B2"), Value::Number(99.0));

    // Snapshot and restore round-trip
    let snaps = wb.snapshot_named_ranges();
    assert_eq!(
        snaps,
        vec![
            NamedRangeSnapshot {
                name: "Bonus".into(),
                scope: None,
                target: None,
                formula: Some("=99".into()),
            },
            NamedRangeSnapshot {
                name: "ExtraBonus".into(),
                scope: Some(s2),
                target: None,
                formula: Some("=$A$1*0.1".into()),
            },
        ]
    );
    let mut wb2 = Workbook::new();
    wb2.add_sheet("Sheet2");
    wb2.set_cell(1, "A1", Value::Number(80.0));
    wb2.restore_named_ranges(snaps).unwrap();
    wb2.set_formula(1, "B1", "=ExtraBonus");
    wb2.set_formula(0, "B1", "=Bonus");
    assert_eq!(wb2.get_cell("Sheet2", "B1"), Value::Number(8.0));
    assert_eq!(wb2.get_cell("Sheet1", "B1"), Value::Number(99.0));
    assert_eq!(
        wb2.define_named_formula("ExtraBonus", Some(99), "=1"),
        Err(WorkbookError::EvalFailed(ValueError::InvalidRef))
    );
}
