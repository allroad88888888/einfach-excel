//! 用户调整 Table 范围：数据不搬家、引用实时更新、一次撤销整体恢复。
use einfach_core::{Value, ValueError};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, Workbook};

fn range(start: &str, end: &str) -> CellRange {
    CellRange::new(
        CellAddress::parse(start).unwrap(),
        CellAddress::parse(end).unwrap(),
    )
}
fn seed() -> (Workbook, WorkbookHistory) {
    let mut workbook = Workbook::new();
    for (addr, text) in [("B2", "Item"), ("C2", "Amount")] {
        workbook.set_cell(0, addr, Value::Text(text.into()));
    }
    for (addr, value) in [("C3", 10.), ("C4", 20.), ("C5", 30.), ("D3", 7.)] {
        workbook.set_cell(0, addr, Value::Number(value));
    }
    workbook
        .define_table(Some("Orders"), 0, range("B2", "C4"), true)
        .unwrap();
    (workbook, WorkbookHistory::default())
}
fn formula(workbook: &Workbook, addr: &str) -> Option<String> {
    workbook
        .sheet(0)
        .unwrap()
        .formula_text_at(CellAddress::parse(addr).unwrap())
}

#[test]
fn growth_and_shrink_keep_body_values_and_reproject_cross_sheet_arrays() {
    let (mut wb, mut history) = seed();
    let other = wb.add_sheet("Report");
    // #All 保留表头，因此缩到一条数据后仍是数组，而非现有引擎的 1×1 标量。
    wb.set_formula(other, "A1", "=Orders[#All]");
    wb.set_formula(other, "E1", "=SUM(A1#)");
    wb.set_formula(0, "F1", "=SUM(Orders[Amount])");
    assert_eq!(wb.get_cell("Report", "E1"), Value::Number(30.));
    assert!(history
        .resize_table(&mut wb, "Orders", range("B2", "C5"))
        .unwrap());
    for _ in 0..3 {
        assert_eq!(history.undo_count(), 1);
        assert_eq!(wb.get_cell("Report", "B4"), Value::Number(30.));
        assert_eq!(wb.get_cell("Report", "E1"), Value::Number(60.));
        assert_eq!(wb.get_cell("Sheet1", "F1"), Value::Number(60.));
        history.undo(&mut wb).unwrap();
        assert_eq!(wb.get_cell("Report", "B4"), Value::Null);
        assert_eq!(wb.get_cell("Report", "E1"), Value::Number(30.));
        assert_eq!(wb.get_cell("Sheet1", "C5"), Value::Number(30.));
        history.redo(&mut wb).unwrap();
    }
    assert!(history
        .resize_table(&mut wb, "Orders", range("B2", "C3"))
        .unwrap());
    assert_eq!(wb.get_cell("Sheet1", "C4"), Value::Number(20.));
    assert_eq!(wb.get_cell("Sheet1", "F1"), Value::Number(10.));
    assert_eq!(wb.get_cell("Report", "E1"), Value::Number(10.));
}

#[test]
fn both_sides_add_columns_without_stealing_retained_names_or_rewriting_data() {
    let (mut wb, mut history) = seed();
    wb.set_cell(0, "A2", Value::Text("Amount".into()));
    wb.set_formula(0, "D2", "=1+1");
    wb.set_formula(0, "F1", "=SUM(Orders[Amount])");
    history
        .resize_table(&mut wb, "Orders", range("A2", "D5"))
        .unwrap();
    assert_eq!(
        wb.get_table("Orders").unwrap().columns(),
        &["Column1", "Item", "Amount", "2"]
    );
    assert_eq!(wb.get_cell("Sheet1", "A2"), Value::Text("Column1".into()));
    assert_eq!(wb.get_cell("Sheet1", "D2"), Value::Text("2".into()));
    assert_eq!(wb.get_cell("Sheet1", "D3"), Value::Number(7.));
    assert_eq!(wb.get_cell("Sheet1", "F1"), Value::Number(60.));
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A2"), Value::Text("Amount".into()));
    assert_eq!(formula(&wb, "D2").as_deref(), Some("=1+1"));
    history.redo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "D2"), Value::Text("2".into()));
}

#[test]
fn removed_column_references_break_permanently_until_undo_restores_exact_source() {
    let (mut wb, mut history) = seed();
    let source = "=  SUM(Orders[Amount])";
    wb.set_formula(0, "F1", source);
    history
        .resize_table(&mut wb, "Orders", range("B2", "B4"))
        .unwrap();
    assert_eq!(
        wb.get_cell("Sheet1", "F1"),
        Value::Error(ValueError::InvalidRef)
    );
    assert_eq!(wb.get_cell("Sheet1", "C3"), Value::Number(10.));
    assert_eq!(formula(&wb, "F1").as_deref(), Some("=SUM(#REF!)"));
    history
        .resize_table(&mut wb, "Orders", range("B2", "C4"))
        .unwrap();
    assert_eq!(
        wb.get_cell("Sheet1", "F1"),
        Value::Error(ValueError::InvalidRef)
    );
    history.undo(&mut wb).unwrap();
    history.undo(&mut wb).unwrap();
    assert_eq!(formula(&wb, "F1").as_deref(), Some(source));
    assert_eq!(wb.get_cell("Sheet1", "F1"), Value::Number(30.));
}

#[test]
fn moving_totals_preserves_body_and_is_one_reversible_command() {
    let (mut wb, mut history) = seed();
    wb.set_cell(0, "C5", Value::Null);
    history
        .set_table_totals_row(&mut wb, "Orders", true)
        .unwrap();
    history.clear("");
    wb.set_cell(0, "C6", Value::Number(40.));
    history
        .resize_table(&mut wb, "Orders", range("B2", "D7"))
        .unwrap();
    assert!(wb.get_table("Orders").unwrap().has_totals());
    assert_eq!(wb.get_cell("Sheet1", "C5"), Value::Null);
    assert_eq!(wb.get_cell("Sheet1", "C7"), Value::Number(70.));
    assert_eq!(
        formula(&wb, "C7").as_deref(),
        Some("=SUBTOTAL(109,Orders[Amount])")
    );
    assert_eq!(history.undo_count(), 1);
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "C5"), Value::Number(30.));
    assert_eq!(wb.get_cell("Sheet1", "C6"), Value::Number(40.));
    assert_eq!(wb.get_cell("Sheet1", "C7"), Value::Null);
    assert_eq!(wb.get_cell("Sheet1", "D2"), Value::Null);
    history.redo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "C7"), Value::Number(70.));
}

#[test]
fn invalid_geometry_obstacles_and_noop_leave_data_revision_and_redo_intact() {
    for obstacle in 0..6 {
        let (mut wb, mut history) = seed();
        history
            .resize_table(&mut wb, "Orders", range("B2", "C5"))
            .unwrap();
        history.undo(&mut wb).unwrap();
        let target = match obstacle {
            0 => range("B3", "C5"),
            1 => range("D2", "E5"),
            2 => CellRange::new(CellAddress::new(1, 1), CellAddress::new(3, 16_384)),
            3 => {
                wb.define_table(Some("Other"), 0, range("D2", "D5"), true)
                    .unwrap();
                range("B2", "D5")
            }
            4 => {
                wb.sheet_mut(0)
                    .unwrap()
                    .restore_merged_ranges(vec![range("D2", "E2")])
                    .unwrap();
                range("B2", "D5")
            }
            _ => {
                wb.set_formula(0, "D4", "=SEQUENCE(3)");
                range("B2", "D5")
            }
        };
        let before = wb.get_table("Orders").unwrap().clone();
        let epoch = wb.tables_epoch();
        assert!(
            history.resize_table(&mut wb, "Orders", target).is_err(),
            "obstacle {obstacle}"
        );
        assert!(!history
            .resize_table(&mut wb, "Orders", before.range())
            .unwrap());
        assert_eq!(wb.get_table("Orders"), Some(&before));
        assert_eq!(wb.tables_epoch(), epoch);
        assert_eq!(history.redo_count(), 1);
        assert_eq!(history.undo_count(), 0);
        assert_eq!(wb.get_cell("Sheet1", "C4"), Value::Number(20.));
    }
}

#[test]
fn occupied_totals_destination_rejects_without_clearing_original_totals() {
    let (mut wb, mut history) = seed();
    wb.set_cell(0, "C5", Value::Null);
    history
        .set_table_totals_row(&mut wb, "Orders", true)
        .unwrap();
    let before = wb.get_table("Orders").unwrap().clone();
    wb.set_cell(0, "B7", Value::Text("Keep".into()));
    let epoch = wb.tables_epoch();
    assert!(history
        .resize_table(&mut wb, "Orders", range("B2", "C7"))
        .is_err());
    assert_eq!(wb.get_table("Orders"), Some(&before));
    assert_eq!(wb.tables_epoch(), epoch);
    assert_eq!(wb.get_cell("Sheet1", "B7"), Value::Text("Keep".into()));
    assert_eq!(wb.get_cell("Sheet1", "C5"), Value::Number(30.));
    assert_eq!(history.undo_count(), 1);
}

#[test]
fn header_only_resize_preserves_excluded_data_and_undo_restores_the_data_range() {
    let (mut wb, mut history) = seed();
    wb.set_formula(0, "F1", "=SUM(Orders[Amount])");
    history
        .resize_table(&mut wb, "Orders", range("B2", "C2"))
        .unwrap();
    assert_eq!(wb.get_table("Orders").unwrap().range(), range("B2", "C2"));
    assert_eq!(wb.get_cell("Sheet1", "C3"), Value::Number(10.));
    assert_eq!(
        wb.get_cell("Sheet1", "F1"),
        Value::Error(ValueError::InvalidRef)
    );
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "F1"), Value::Number(30.));
}
