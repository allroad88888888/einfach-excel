//! 全局范围改名不改字符串或同名局部变量，也不能捕获目标名称处的局部绑定。
use einfach_core::{Value, ValueError};
use einfach_excel_core::workbook::NamedRangeAction as Action;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, Workbook};

fn seed() -> Workbook {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(10.0));
    wb.set_cell(0, "A2", Value::Number(20.0));
    wb.define_named_range(
        "Sales",
        0,
        CellRange::new(CellAddress::new(0, 0), CellAddress::new(1, 0)),
    )
    .unwrap();
    wb
}
fn rename(name: &str, new_name: &str) -> Action {
    Action::Update {
        name: name.into(),
        new_name: new_name.into(),
        target: None,
    }
}

#[test]
fn rename_rewrites_cell_references_and_undo_restores_exact_sources() {
    let mut wb = seed();
    let other = wb.add_sheet("Other");
    let original = "=  sum( Sales ) + 1";
    wb.set_formula(other, "A1", original);
    wb.set_formula(other, "A2", "=\"Sales\"");
    wb.set_formula(other, "A3", "=LET(Sales,3,Sales+1)");
    let mut history = WorkbookHistory::default();
    history
        .change_named_range(&mut wb, 0, rename("sales", "收入"))
        .unwrap();
    assert_eq!(wb.get_cell("Other", "A1"), Value::Number(31.0));
    assert_eq!(
        wb.sheet(other).unwrap().get_formula("A1").as_deref(),
        Some("=(SUM(收入)+1)")
    );
    assert_eq!(
        wb.sheet(other).unwrap().get_formula("A2").as_deref(),
        Some("=\"Sales\"")
    );
    assert_eq!(
        wb.sheet(other).unwrap().get_formula("A3").as_deref(),
        Some("=LET(Sales,3,Sales+1)")
    );
    assert_eq!(
        history.entries().next().unwrap().affected_sheets(),
        vec![0, 1]
    );
    for _ in 0..3 {
        history.undo(&mut wb).unwrap();
        assert_eq!(
            wb.sheet(other).unwrap().get_formula("A1").as_deref(),
            Some(original)
        );
        assert!(wb.named_range("Sales").unwrap().is_some());
        history.redo(&mut wb).unwrap();
        assert_eq!(wb.get_cell("Other", "A1"), Value::Number(31.0));
    }
}

#[test]
fn new_global_name_does_not_capture_existing_let_or_lambda_locals() {
    let mut wb = seed();
    for (addr, source) in [
        ("C1", "=LET(Total,7,SUM(Sales)+Total)"),
        ("C2", "=LAMBDA(Total,SUM(Sales)+Total)(7)"),
        ("C3", "=LET(Total,7,LET(_named_local_1,9,SUM(Sales)+Total))"),
        ("C4", "=LET(Total,7,LET(Total,8,SUM(Sales)+Total)-1)"),
    ] {
        assert!(wb.set_formula(0, addr, source));
        assert_eq!(wb.get_cell("Sheet1", addr), Value::Number(37.0));
    }
    let mut history = WorkbookHistory::default();
    history
        .change_named_range(&mut wb, 0, rename("Sales", "Total"))
        .unwrap();
    for addr in ["C1", "C2", "C3", "C4"] {
        assert_eq!(wb.get_cell("Sheet1", addr), Value::Number(37.0), "{addr}");
    }
    history.undo(&mut wb).unwrap();
    assert_eq!(
        wb.sheet(0).unwrap().get_formula("C1").as_deref(),
        Some("=LET(Total,7,SUM(Sales)+Total)")
    );
}

#[test]
fn renaming_and_retargeting_updates_spills_and_their_dependents_together() {
    let mut wb = seed();
    wb.set_cell(0, "A5", Value::Number(50.0));
    wb.set_formula(0, "C1", "=Sales");
    wb.set_formula(0, "E1", "=C1#*2");
    assert_eq!(wb.get_cell("Sheet1", "E2"), Value::Number(40.0));
    let mut history = WorkbookHistory::default();
    history
        .change_named_range(
            &mut wb,
            0,
            Action::Update {
                name: "Sales".into(),
                new_name: "NewSales".into(),
                target: Some((0, CellRange::single(CellAddress::new(4, 0)))),
            },
        )
        .unwrap();
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(50.0));
    assert_eq!(wb.get_cell("Sheet1", "C2"), Value::Null);
    // 单格不再是 spill；下游保持自己的原公式并返回 #REF!。
    assert_eq!(
        wb.get_cell("Sheet1", "E1"),
        Value::Error(ValueError::InvalidRef)
    );
    assert_eq!(wb.get_cell("Sheet1", "E2"), Value::Null);
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "C2"), Value::Number(20.0));
    assert_eq!(wb.get_cell("Sheet1", "E2"), Value::Number(40.0));
}

#[test]
fn external_formula_edits_reject_undo_before_changing_the_name() {
    let mut wb = seed();
    wb.set_formula(0, "C1", "=SUM(Sales)");
    let mut history = WorkbookHistory::default();
    history
        .change_named_range(&mut wb, 0, rename("Sales", "Total"))
        .unwrap();
    wb.set_formula(0, "C1", "=42");
    assert!(history.undo(&mut wb).is_err());
    assert_eq!(wb.named_names().collect::<Vec<_>>(), vec!["Total"]);
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(42.0));
}

#[test]
fn broken_range_can_be_renamed_deleted_and_restored_without_rebinding() {
    let mut wb = seed();
    let other = wb.add_sheet("Other");
    wb.set_formula(other, "A1", "=SUM(Sales)");
    wb.remove_sheet(0).unwrap();
    let mut history = WorkbookHistory::default();
    history
        .change_named_range(&mut wb, 0, rename("Sales", "Broken"))
        .unwrap();
    assert_eq!(
        wb.get_cell("Other", "A1"),
        Value::Error(ValueError::InvalidRef)
    );
    history
        .change_named_range(
            &mut wb,
            0,
            Action::Delete {
                name: "Broken".into(),
            },
        )
        .unwrap();
    assert_eq!(
        wb.get_cell("Other", "A1"),
        Value::Error(ValueError::InvalidName)
    );
    history.undo(&mut wb).unwrap();
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.named_range("Sales"), Err(ValueError::InvalidRef));
    assert_eq!(
        wb.sheet(0).unwrap().get_formula("A1").as_deref(),
        Some("=SUM(Sales)")
    );
}
