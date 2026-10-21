//! 输入与 Table 自动扩展必须共用一条历史、一次通知与同一套输入校验。
use einfach_core::Value;
use einfach_excel_core::data_validation::{DataValidationKind, DataValidationRule};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, NumberFormat, Workbook};
use std::{cell::Cell, rc::Rc};

fn range(first: &str, last: &str) -> CellRange {
    CellRange::new(
        CellAddress::parse(first).unwrap(),
        CellAddress::parse(last).unwrap(),
    )
}
fn seed() -> (Workbook, WorkbookHistory) {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Text("Item".into()));
    wb.set_cell(0, "B1", Value::Text("Amount".into()));
    wb.set_cell(0, "B2", Value::Number(10.));
    wb.define_table(Some("Orders"), 0, range("A1", "B2"), true)
        .unwrap();
    (wb, WorkbookHistory::default())
}

#[test]
fn row_input_reprojects_arrays_and_notifies_once_per_history_step() {
    let (mut wb, mut history) = seed();
    let report = wb.add_sheet("Report");
    wb.set_formula(report, "A1", "=Orders[#All]");
    wb.set_formula(report, "E1", "=SUM(A1#)");
    let hits = Rc::new(Cell::new(0));
    let observed = hits.clone();
    wb.sheet_mut(report)
        .unwrap()
        .subscribe_cell("E1", move || observed.set(observed.get() + 1));
    hits.set(0);
    history.set_cell_input(&mut wb, 0, "B3", "25%").unwrap();
    assert_eq!(wb.get_table("Orders").unwrap().range(), range("A1", "B3"));
    assert_eq!(wb.get_cell("Report", "E1"), Value::Number(10.25));
    assert_eq!(
        wb.sheet(0).unwrap().get_format("B3").number_format,
        NumberFormat::Percent { digits: 0 }
    );
    assert_eq!(hits.replace(0), 1);
    assert_eq!(history.undo_count(), 1);
    for _ in 0..3 {
        history.undo(&mut wb).unwrap();
        assert_eq!(wb.get_table("Orders").unwrap().range(), range("A1", "B2"));
        assert_eq!(wb.get_cell("Sheet1", "B3"), Value::Null);
        assert_eq!(wb.get_cell("Report", "B3"), Value::Null);
        assert_eq!(wb.get_cell("Report", "E1"), Value::Number(10.));
        assert_eq!(hits.replace(0), 1);
        history.redo(&mut wb).unwrap();
        assert_eq!(wb.get_cell("Report", "E1"), Value::Number(10.25));
        assert_eq!(hits.replace(0), 1);
    }
}

#[test]
fn right_body_input_adds_header_and_resolves_structured_formula_in_new_geometry() {
    let (mut wb, mut history) = seed();
    history
        .set_cell_input(&mut wb, 0, "C2", "=[@Amount]*2")
        .unwrap();
    assert_eq!(
        wb.get_table("Orders").unwrap().columns(),
        &["Item", "Amount", "Column1"]
    );
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Text("Column1".into()));
    assert_eq!(wb.get_cell("Sheet1", "C2"), Value::Number(20.));
    assert_eq!(history.undo_count(), 1);
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Null);
    assert_eq!(wb.get_cell("Sheet1", "C2"), Value::Null);
    history.redo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "C2"), Value::Number(20.));
}

#[test]
fn new_header_inputs_are_literal_unique_and_undo_restores_previous_content() {
    for (input, expected) in [
        ("=1+1", "=1+1"),
        ("'0012", "0012"),
        ("Amount", "Column1"),
        (" ", "Column1"),
    ] {
        let (mut wb, mut history) = seed();
        wb.set_cell(0, "C1", Value::Text("Previous".into()));
        history.set_cell_input(&mut wb, 0, "C1", input).unwrap();
        assert_eq!(wb.get_table("Orders").unwrap().columns()[2], expected);
        assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Text(expected.into()));
        history.undo(&mut wb).unwrap();
        assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Text("Previous".into()));
        assert_eq!(wb.get_table("Orders").unwrap().range(), range("A1", "B2"));
    }
}

#[test]
fn invalid_formula_spill_or_validation_rolls_back_expansion_and_preserves_redo() {
    for input in ["=SUM(", "=C2", "=SEQUENCE(3)", "99", "=99"] {
        let (mut wb, mut history) = seed();
        history.set_cell_input(&mut wb, 0, "B2", "20").unwrap();
        history.undo(&mut wb).unwrap();
        if input == "99" || input == "=99" {
            wb.sheet_mut(0)
                .unwrap()
                .set_data_validation(
                    range("C2", "C2"),
                    Some(DataValidationRule {
                        options: Default::default(), kind: DataValidationKind::WholeNumber { min: 0., max: 10. },
                        ignore_blank: true,
                        operator: Default::default(),
                    }),
                )
                .unwrap();
        }
        assert!(
            history.set_cell_input(&mut wb, 0, "C2", input).is_err(),
            "{input}"
        );
        assert_eq!(wb.get_table("Orders").unwrap().range(), range("A1", "B2"));
        for addr in ["C1", "C2", "C3", "C4"] {
            assert_eq!(wb.get_cell("Sheet1", addr), Value::Null);
        }
        assert_eq!((history.undo_count(), history.redo_count()), (0, 1));
        history.redo(&mut wb).unwrap();
        assert_eq!(wb.get_cell("Sheet1", "B2"), Value::Number(20.));
    }
}

#[test]
fn clearing_diagonal_cells_and_existing_neighbor_tables_do_not_expand() {
    let (mut wb, mut history) = seed();
    history.set_cell_input(&mut wb, 0, "B3", "").unwrap();
    assert_eq!(history.undo_count(), 0);
    history.set_cell_input(&mut wb, 0, "C3", "7").unwrap();
    assert_eq!(wb.get_table("Orders").unwrap().range(), range("A1", "B2"));
    wb.define_table(Some("Neighbor"), 0, range("C1", "D2"), true)
        .unwrap();
    history.set_cell_input(&mut wb, 0, "C2", "8").unwrap();
    assert_eq!(wb.get_table("Orders").unwrap().range(), range("A1", "B2"));
    assert_eq!(wb.get_table("Neighbor").unwrap().range(), range("C1", "D2"));
}

#[test]
fn rejected_expansion_does_not_publish_transient_values_to_cross_sheet_observers() {
    let (mut wb, mut history) = seed();
    let report = wb.add_sheet("Report");
    wb.set_formula(report, "A1", "=SUM(Orders[Amount])");
    let hits = Rc::new(Cell::new(0));
    let observed = hits.clone();
    wb.sheet_mut(report)
        .unwrap()
        .subscribe_cell("A1", move || observed.set(observed.get() + 1));
    hits.set(0);
    assert!(history.set_cell_input(&mut wb, 0, "B3", "=SUM(").is_err());
    assert_eq!(wb.get_cell("Report", "A1"), Value::Number(10.));
    assert_eq!(hits.get(), 0);
}

#[test]
fn totals_remain_final_when_expanding_right_and_below_totals_is_plain_input() {
    let (mut wb, mut history) = seed();
    history
        .set_table_totals_row(&mut wb, "Orders", true)
        .unwrap();
    history.clear("");
    history.set_cell_input(&mut wb, 0, "C2", "5").unwrap();
    assert_eq!(wb.get_table("Orders").unwrap().range(), range("A1", "C3"));
    assert!(wb.get_table("Orders").unwrap().has_totals());
    assert_eq!(wb.get_cell("Sheet1", "B3"), Value::Number(10.));
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.get_table("Orders").unwrap().range(), range("A1", "B3"));
    history.set_cell_input(&mut wb, 0, "B4", "20").unwrap();
    assert_eq!(wb.get_table("Orders").unwrap().range(), range("A1", "B3"));
    assert_eq!(wb.get_cell("Sheet1", "B3"), Value::Number(10.));
}

#[test]
fn protected_sheet_policy_allows_plain_input_without_touching_the_new_header() {
    let (mut wb, mut history) = seed();
    history
        .set_cell_input_with_table_expansion(&mut wb, 0, "C2", "7", false)
        .unwrap();
    assert_eq!(wb.get_table("Orders").unwrap().range(), range("A1", "B2"));
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Null);
    assert_eq!(wb.get_cell("Sheet1", "C2"), Value::Number(7.));
    assert_eq!(history.undo_count(), 1);
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "C2"), Value::Null);
}

#[test]
fn adjacent_obstacles_keep_a_valid_plain_input_without_resizing() {
    for obstacle in 0..2 {
        let (mut wb, mut history) = seed();
        if obstacle == 0 {
            wb.sheet_mut(0)
                .unwrap()
                .restore_merged_ranges(vec![range("C1", "D1")])
                .unwrap();
        } else {
            wb.define_table(Some("Neighbor"), 0, range("C1", "D1"), true)
                .unwrap();
        }
        history.set_cell_input(&mut wb, 0, "C2", "7").unwrap();
        assert_eq!(wb.get_table("Orders").unwrap().range(), range("A1", "B2"));
        assert_eq!(wb.get_cell("Sheet1", "C2"), Value::Number(7.));
        assert_eq!(history.undo_count(), 1);
        history.undo(&mut wb).unwrap();
        assert_eq!(wb.get_cell("Sheet1", "C2"), Value::Null);
    }
}

#[test]
fn ambiguous_adjacency_never_picks_a_table_by_registry_order() {
    let (mut wb, mut history) = seed();
    wb.define_table(Some("LeftTable"), 0, range("A3", "A4"), true)
        .unwrap();
    history.set_cell_input(&mut wb, 0, "B3", "7").unwrap();
    assert_eq!(wb.get_table("Orders").unwrap().range(), range("A1", "B2"));
    assert_eq!(wb.get_table("LeftTable").unwrap().range(), range("A3", "A4"));
    assert_eq!(wb.get_cell("Sheet1", "B3"), Value::Number(7.));
    assert_eq!(history.undo_count(), 1);
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "B3"), Value::Null);
}

#[test]
fn expansion_reaches_the_final_grid_row_or_column_but_never_writes_beyond_it() {
    for (first, last, input, invalid, expanded) in [
        ("A1048575", "A1048575", "A1048576", "A1048577", "A1048576"),
        ("XFC1", "XFC2", "XFD2", "XFE2", "XFD2"),
    ] {
        let mut wb = Workbook::new();
        wb.set_cell(0, first, Value::Text("Amount".into()));
        wb.define_table(Some("Orders"), 0, range(first, last), true)
            .unwrap();
        let mut history = WorkbookHistory::default();
        history.set_cell_input(&mut wb, 0, input, "7").unwrap();
        assert_eq!(
            wb.get_table("Orders").unwrap().range(),
            range(first, expanded)
        );
        assert_eq!(wb.get_cell("Sheet1", input), Value::Number(7.));
        assert!(history.set_cell_input(&mut wb, 0, invalid, "9").is_err());
        assert_eq!(history.undo_count(), 1);
        history.undo(&mut wb).unwrap();
        assert_eq!(wb.get_table("Orders").unwrap().range(), range(first, last));
        assert_eq!(wb.get_cell("Sheet1", input), Value::Null);
    }
}
