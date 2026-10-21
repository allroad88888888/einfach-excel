use einfach_core::Value;
use einfach_excel_core::{
    AutoFillDirection, AutoFillRequest, AutoFillSeries, CellAddress, CellRange, Workbook,
};
use einfach_excel_core::workbook_history::WorkbookHistory;

fn range(a: &str, b: &str) -> CellRange {
    CellRange::new(
        CellAddress::parse(a).unwrap(),
        CellAddress::parse(b).unwrap(),
    )
}
fn request(source: CellRange, target: CellRange, direction: AutoFillDirection) -> AutoFillRequest {
    AutoFillRequest {
        sheet_idx: 0,
        source_range: source,
        target_range: target,
        direction,
        series: AutoFillSeries::Copy,
        step: None,
        text_pattern: None,
        list: None,
    }
}

#[test]
fn columns_infer_independent_numeric_text_and_formula_lanes() {
    let mut wb = Workbook::new();
    for (addr, n) in [("A3", 1.0), ("A4", 3.0), ("B3", 10.0), ("B4", 20.0)] {
        wb.set_cell(0, addr, Value::Number(n));
    }
    wb.set_cell(0, "C3", Value::Text("Item001".into()));
    wb.set_cell(0, "C4", Value::Text("Item003".into()));
    assert!(wb.set_formula(0, "D3", "=A3+$B$3"));
    assert!(wb.set_formula(0, "D4", "=A4+$B$3"));
    let report = wb
        .apply_inferred_auto_fill(&request(
            range("A3", "D4"),
            range("A3", "D6"),
            AutoFillDirection::Down,
        ))
        .unwrap();
    assert_eq!(report.written, 8);
    for (addr, value) in [("A6", 7.0), ("B6", 40.0), ("D6", 17.0)] {
        assert_eq!(wb.get_cell("Sheet1", addr), Value::Number(value));
    }
    assert_eq!(wb.get_cell("Sheet1", "C6"), Value::Text("Item007".into()));
    assert_eq!(
        wb.sheet(0).unwrap().get_formula("D6").as_deref(),
        Some("=(A6+$B$3)")
    );
}

#[test]
fn rows_infer_independent_sequences_forward_and_reverse() {
    for (direction, target, last, expected) in [
        (AutoFillDirection::Right, range("C3", "F4"), "F3", 7.0),
        (AutoFillDirection::Left, range("A3", "D4"), "A3", -3.0),
    ] {
        let mut wb = Workbook::new();
        for (addr, n) in [("C3", 1.0), ("D3", 3.0), ("C4", 10.0), ("D4", 20.0)] {
            wb.set_cell(0, addr, Value::Number(n));
        }
        wb.apply_inferred_auto_fill(&request(range("C3", "D4"), target, direction))
            .unwrap();
        assert_eq!(wb.get_cell("Sheet1", last), Value::Number(expected));
        assert_eq!(
            wb.get_cell(
                "Sheet1",
                if direction == AutoFillDirection::Right {
                    "F4"
                } else {
                    "A4"
                }
            ),
            Value::Number(if direction == AutoFillDirection::Right {
                40.0
            } else {
                -10.0
            })
        );
    }
}

#[test]
fn reverse_columns_and_unrecognized_lanes_keep_independent_copy_fallback() {
    let mut wb = Workbook::new();
    for (addr, n) in [("A3", 1.0), ("A4", 3.0), ("B3", 10.0), ("B4", 10.0)] {
        wb.set_cell(0, addr, Value::Number(n));
    }
    wb.apply_inferred_auto_fill(&request(
        range("A3", "B4"),
        range("A1", "B4"),
        AutoFillDirection::Up,
    ))
    .unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(-3.0));
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(10.0));
}

#[test]
fn a_late_lane_overflow_rejects_the_entire_fill_without_partial_writes() {
    let mut wb = Workbook::new();
    for (addr, n) in [
        ("A1", 1.0),
        ("A2", 3.0),
        ("B1", 1e308),
        ("B2", 1.5e308),
        ("A3", 99.0),
        ("B3", 77.0),
    ] {
        wb.set_cell(0, addr, Value::Number(n));
    }
    assert!(wb
        .apply_inferred_auto_fill(&request(
            range("A1", "B2"),
            range("A1", "B4"),
            AutoFillDirection::Down
        ))
        .is_err());
    assert_eq!(wb.get_cell("Sheet1", "A3"), Value::Number(99.0));
    assert_eq!(wb.get_cell("Sheet1", "B3"), Value::Number(77.0));
    assert_eq!(wb.get_cell("Sheet1", "A4"), Value::Null);
}

#[test]
fn merged_targets_and_oversized_matrices_are_rejected_before_planning_lanes() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(1.0));
    wb.sheet_mut(0)
        .unwrap()
        .restore_merged_ranges(vec![range("A3", "B3")])
        .unwrap();
    for target in [range("A1", "B4"), range("A1", "B1048576")] {
        assert!(wb
            .apply_inferred_auto_fill(&request(range("A1", "B1"), target, AutoFillDirection::Down))
            .is_err());
    }
    assert_eq!(wb.get_cell("Sheet1", "A2"), Value::Null);
}

#[test]
fn every_lane_is_undone_and_redone_in_one_history_entry() {
    let mut wb = Workbook::new();
    for (addr, n) in [("A1", 1.0), ("A2", 3.0), ("B1", 10.0), ("B2", 20.0)] {
        wb.set_cell(0, addr, Value::Number(n));
    }
    let mut history = WorkbookHistory::default();
    history
        .begin(&wb, 0, range("A3", "B4"), "Independent series", true)
        .unwrap();
    history
        .apply_inferred_auto_fill(
            &mut wb,
            &request(
                range("A1", "B2"),
                range("A1", "B4"),
                AutoFillDirection::Down,
            ),
        )
        .unwrap();
    history.finish(&mut wb, true).unwrap();
    assert_eq!(history.undo_count(), 1);
    assert!(history.undo(&mut wb).unwrap());
    assert_eq!(wb.get_cell("Sheet1", "A4"), Value::Null);
    assert_eq!(wb.get_cell("Sheet1", "B4"), Value::Null);
    assert_eq!(history.undo_count(), 0);
    assert!(history.redo(&mut wb).unwrap());
    assert_eq!(wb.get_cell("Sheet1", "A4"), Value::Number(7.0));
    assert_eq!(wb.get_cell("Sheet1", "B4"), Value::Number(40.0));
}
