use einfach_core::Value;
use einfach_excel_core::{
    AutoFillDirection, AutoFillRequest, AutoFillSeries, CellAddress, CellRange, Workbook,
};

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
fn automatic_numbers_extend_in_all_four_directions() {
    for (a, b, first, last, end, direction, expected) in [
        ("C3", "C4", "C3", "C6", "C6", AutoFillDirection::Down, 7.0),
        ("C3", "C4", "C1", "C4", "C1", AutoFillDirection::Up, -3.0),
        ("C3", "D3", "C3", "F3", "F3", AutoFillDirection::Right, 7.0),
        ("C3", "D3", "A3", "D3", "A3", AutoFillDirection::Left, -3.0),
    ] {
        let mut wb = Workbook::new();
        wb.set_cell(0, a, Value::Number(1.0));
        wb.set_cell(0, b, Value::Number(3.0));
        let inferred = wb
            .infer_auto_fill_request(request(range(a, b), range(first, last), direction))
            .unwrap();
        assert_eq!(inferred.series, AutoFillSeries::IntegerStep);
        wb.apply_auto_fill(&inferred).unwrap();
        assert_eq!(wb.get_cell("Sheet1", end), Value::Number(expected));
        assert_eq!(wb.get_cell("Sheet1", a), Value::Number(1.0));
    }
}

#[test]
fn automatic_numbering_preserves_padding_in_reverse() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "C3", Value::Text("Item005".into()));
    wb.set_cell(0, "C4", Value::Text("Item007".into()));
    let r = wb
        .infer_auto_fill_request(request(
            range("C3", "C4"),
            range("C1", "C4"),
            AutoFillDirection::Up,
        ))
        .unwrap();
    assert_eq!(r.series, AutoFillSeries::TextNumber);
    wb.apply_auto_fill(&r).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Text("Item001".into()));
}

#[test]
fn irregular_constant_single_formula_and_matrix_sources_fall_back_to_copy() {
    for source in [range("A1", "A3"), range("A1", "A1"), range("A1", "B3")] {
        let mut wb = Workbook::new();
        for (a, n) in [("A1", 1.0), ("A2", 3.0), ("A3", 8.0)] {
            wb.set_cell(0, a, Value::Number(n));
        }
        let r = wb
            .infer_auto_fill_request(request(
                source,
                CellRange::new(source.start, CellAddress::new(5, source.end.col)),
                AutoFillDirection::Down,
            ))
            .unwrap();
        assert_eq!(r.series, AutoFillSeries::Copy);
        wb.apply_auto_fill(&r).unwrap();
    }
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(1.0));
    wb.set_cell(0, "A2", Value::Number(1.0));
    let input = request(
        range("A1", "A2"),
        range("A1", "A4"),
        AutoFillDirection::Down,
    );
    assert_eq!(
        wb.infer_auto_fill_request(input.clone()).unwrap().series,
        AutoFillSeries::Copy
    );
    assert!(wb.set_formula(0, "A2", "=3"));
    let inferred = wb.infer_auto_fill_request(input).unwrap();
    assert_eq!(inferred.series, AutoFillSeries::Copy);
    wb.apply_auto_fill(&inferred).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A4"), Value::Number(3.0));
}

#[test]
fn recognized_series_overflow_is_rejected_not_replaced_with_copy() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(1e308));
    wb.set_cell(0, "A2", Value::Number(1.5e308));
    wb.set_cell(0, "A3", Value::Number(99.0));
    let r = wb
        .infer_auto_fill_request(request(
            range("A1", "A2"),
            range("A1", "A4"),
            AutoFillDirection::Down,
        ))
        .unwrap();
    assert_ne!(r.series, AutoFillSeries::Copy);
    assert!(wb.apply_auto_fill(&r).is_err());
    assert_eq!(wb.get_cell("Sheet1", "A3"), Value::Number(99.0));
}

#[test]
fn explicit_copy_does_not_infer_a_number_sequence() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(1.0));
    wb.set_cell(0, "A2", Value::Number(3.0));
    wb.apply_auto_fill(&request(
        range("A1", "A2"),
        range("A1", "A4"),
        AutoFillDirection::Down,
    ))
    .unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A3"), Value::Number(1.0));
    assert_eq!(wb.get_cell("Sheet1", "A4"), Value::Number(3.0));
}
