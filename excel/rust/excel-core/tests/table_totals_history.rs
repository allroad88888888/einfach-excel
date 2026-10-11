//! 用户汇总操作必须原子修改范围与公式，并复用同一条原生历史。
use einfach_core::Value;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellFormat, CellRange, TotalsFunction, Workbook};

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
        wb.set_cell(0, &format!("A{row}"), Value::Text(format!("Item{row}")));
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
fn formula(wb: &Workbook, addr: &str) -> Option<String> {
    wb.sheet(0)
        .unwrap()
        .formula_text_at(CellAddress::parse(addr).unwrap())
}

#[test]
fn show_choose_hide_are_single_steps_and_keep_formats_and_body() {
    let (mut wb, mut history) = seed();
    wb.sheet_mut(0).unwrap().set_format(
        "B5",
        CellFormat {
            bold: true,
            ..Default::default()
        },
    );
    assert!(history
        .set_table_totals_row(&mut wb, "Inventory", true)
        .unwrap());
    assert_eq!(history.undo_count(), 1);
    assert_eq!(
        wb.get_table("Inventory").unwrap().range(),
        range("A1", "B5")
    );
    assert_eq!(wb.get_cell("Sheet1", "B5"), Value::Number(60.0));
    assert_eq!(
        formula(&wb, "B5").as_deref(),
        Some("=SUBTOTAL(109,Inventory[Amount])")
    );
    assert!(history
        .set_table_total_function(&mut wb, "Inventory", "amount", TotalsFunction::Average)
        .unwrap());
    assert_eq!(wb.get_cell("Sheet1", "B5"), Value::Number(20.0));
    assert!(history
        .set_table_totals_row(&mut wb, "Inventory", false)
        .unwrap());
    assert_eq!(history.undo_count(), 3);
    assert_eq!(wb.get_cell("Sheet1", "B5"), Value::Null);
    for _ in 0..3 {
        history.undo(&mut wb).unwrap();
        assert_eq!(wb.get_cell("Sheet1", "B5"), Value::Number(20.0));
        history.undo(&mut wb).unwrap();
        assert_eq!(wb.get_cell("Sheet1", "B5"), Value::Number(60.0));
        history.undo(&mut wb).unwrap();
        assert_eq!(wb.get_cell("Sheet1", "B5"), Value::Null);
        assert!(!wb.get_table("Inventory").unwrap().has_totals());
        for _ in 0..3 {
            history.redo(&mut wb).unwrap();
        }
        assert_eq!(wb.get_cell("Sheet1", "B4"), Value::Number(30.0));
        assert!(wb.sheet(0).unwrap().get_format("B5").bold);
    }
}

#[test]
fn every_total_function_is_a_live_formula_and_none_is_a_real_clear() {
    let (mut wb, mut history) = seed();
    history
        .set_table_totals_row(&mut wb, "Inventory", true)
        .unwrap();
    let table_epoch = wb.tables_epoch();
    for (function, expected) in [
        (TotalsFunction::Average, 20.0),
        (TotalsFunction::Count, 3.0),
        (TotalsFunction::CountNums, 3.0),
        (TotalsFunction::Max, 30.0),
        (TotalsFunction::Min, 10.0),
        (TotalsFunction::StdDev, 10.0),
        (TotalsFunction::Var, 100.0),
        (TotalsFunction::Sum, 60.0),
    ] {
        history
            .set_table_total_function(&mut wb, "Inventory", "Amount", function)
            .unwrap();
        assert_eq!(wb.get_cell("Sheet1", "B5"), Value::Number(expected));
        assert_eq!(
            wb.tables_epoch(),
            table_epoch,
            "cell-only edits do not invalidate table geometry"
        );
        assert_eq!(
            formula(&wb, "B5"),
            Some(format!(
                "=SUBTOTAL({},Inventory[Amount])",
                function.subtotal_code().unwrap()
            ))
        );
    }
    history
        .set_table_total_function(&mut wb, "Inventory", "Product", TotalsFunction::Count)
        .unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A5"), Value::Number(3.0));
    history
        .set_table_total_function(&mut wb, "Inventory", "Amount", TotalsFunction::None)
        .unwrap();
    assert_eq!(formula(&wb, "B5"), None);
    assert_eq!(wb.get_cell("Sheet1", "B5"), Value::Null);
    history.undo(&mut wb).unwrap();
    wb.set_cell(0, "B2", Value::Number(40.0));
    assert_eq!(wb.get_cell("Sheet1", "B5"), Value::Number(90.0));
    wb.set_eval_hidden_rows(0, &[1]);
    assert_eq!(wb.get_cell("Sheet1", "B5"), Value::Number(50.0));
}

#[test]
fn noops_and_rejections_preserve_redo() {
    let (mut wb, mut history) = seed();
    history
        .set_table_totals_row(&mut wb, "Inventory", true)
        .unwrap();
    history
        .set_table_total_function(&mut wb, "Inventory", "Amount", TotalsFunction::Average)
        .unwrap();
    history.undo(&mut wb).unwrap();
    assert!(!history
        .set_table_totals_row(&mut wb, "Inventory", true)
        .unwrap());
    assert!(!history
        .set_table_total_function(&mut wb, "Inventory", "Amount", TotalsFunction::Sum)
        .unwrap());
    assert!(history
        .set_table_total_function(&mut wb, "Inventory", "Missing", TotalsFunction::Sum)
        .is_err());
    assert_eq!(history.redo_count(), 1);
    history.redo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "B5"), Value::Number(20.0));
}

#[test]
fn occupancy_merge_spill_other_table_and_grid_end_reject_before_writing() {
    for obstacle in 0..4 {
        let (mut wb, mut history) = seed();
        match obstacle {
            0 => wb.set_cell(0, "A5", Value::Text("Keep".into())),
            1 => {
                wb.sheet_mut(0)
                    .unwrap()
                    .restore_merged_ranges(vec![range("A5", "B5")])
                    .unwrap();
            }
            2 => {
                assert!(wb.set_formula(0, "A5", "=SEQUENCE(1,2)"));
            }
            _ => {
                wb.define_table(Some("Other"), 0, range("A5", "B6"), true)
                    .unwrap();
            }
        }
        let before = wb.get_table("Inventory").unwrap().clone();
        let value = wb.get_cell("Sheet1", "A5");
        let epoch = wb.tables_epoch();
        assert!(history
            .set_table_totals_row(&mut wb, "Inventory", true)
            .is_err());
        assert_eq!(wb.get_table("Inventory"), Some(&before));
        assert_eq!(wb.get_cell("Sheet1", "A5"), value);
        assert_eq!(wb.tables_epoch(), epoch);
        assert_eq!(history.undo_count(), 0);
    }
    let (mut wb, mut history) = seed();
    wb.define_table(Some("LastRow"), 0, range("D1048575", "D1048576"), true)
        .unwrap();
    assert!(history
        .set_table_totals_row(&mut wb, "LastRow", true)
        .is_err());
    assert!(!wb.get_table("LastRow").unwrap().has_totals());
}

#[test]
fn external_cell_changes_reject_undo_atomically_and_allow_a_corrected_retry() {
    let (mut wb, mut history) = seed();
    history
        .set_table_totals_row(&mut wb, "Inventory", true)
        .unwrap();
    let source = formula(&wb, "B5").unwrap();
    wb.set_cell(0, "B5", Value::Text("Outside history".into()));
    let epoch = wb.tables_epoch();
    assert!(history.undo(&mut wb).is_err());
    assert!(wb.get_table("Inventory").unwrap().has_totals());
    assert_eq!(history.undo_count(), 1);
    assert_eq!(wb.tables_epoch(), epoch);
    assert_eq!(
        wb.get_cell("Sheet1", "B5"),
        Value::Text("Outside history".into())
    );
    assert!(wb.set_formula(0, "B5", &source));
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "B5"), Value::Null);
}

#[test]
fn whole_table_array_consumers_expand_and_shrink_across_sheets() {
    let (mut wb, mut history) = seed();
    let other = wb.add_sheet("Other");
    assert!(wb.set_formula(other, "D1", "=Inventory[#All]"));
    assert!(wb.set_formula(other, "H1", "=SUM(D1#)"));
    assert_eq!(wb.get_cell("Other", "E4"), Value::Number(30.0));
    assert_eq!(wb.get_cell("Other", "H1"), Value::Number(60.0));
    history
        .set_table_totals_row(&mut wb, "Inventory", true)
        .unwrap();
    for _ in 0..3 {
        assert_eq!(wb.get_cell("Other", "E5"), Value::Number(60.0));
        assert_eq!(wb.get_cell("Other", "H1"), Value::Number(120.0));
        history.undo(&mut wb).unwrap();
        assert_eq!(wb.get_cell("Other", "E5"), Value::Null);
        assert_eq!(wb.get_cell("Other", "H1"), Value::Number(60.0));
        history.redo(&mut wb).unwrap();
    }
    // 单格汇总公式改动不发布目录 epoch，跨表数组仍须通过单元格依赖更新。
    let epoch = wb.tables_epoch();
    history
        .set_table_total_function(&mut wb, "Inventory", "Amount", TotalsFunction::Average)
        .unwrap();
    assert_eq!(wb.tables_epoch(), epoch);
    assert_eq!(wb.get_cell("Other", "E5"), Value::Number(20.0));
    assert_eq!(wb.get_cell("Other", "H1"), Value::Number(80.0));
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Other", "E5"), Value::Number(60.0));
    assert_eq!(wb.get_cell("Other", "H1"), Value::Number(120.0));
    history.redo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Other", "E5"), Value::Number(20.0));
    assert_eq!(wb.get_cell("Other", "H1"), Value::Number(80.0));
}
