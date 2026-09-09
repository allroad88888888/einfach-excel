use einfach_core::Value;
use einfach_excel_core::{
    AutoFillDirection, AutoFillRequest, AutoFillSeries, CellAddress, CellRange, Workbook,
};

fn range(first: &str, last: &str) -> CellRange {
    CellRange::new(
        CellAddress::parse(first).unwrap(),
        CellAddress::parse(last).unwrap(),
    )
}
fn request(series: AutoFillSeries, source: &str, target: &str) -> AutoFillRequest {
    AutoFillRequest {
        sheet_idx: 0,
        source_range: range("A1", source),
        target_range: range("A1", target),
        direction: if source.starts_with('A') {
            AutoFillDirection::Down
        } else {
            AutoFillDirection::Right
        },
        series,
        step: None,
        text_pattern: None,
        list: None,
    }
}
fn extend(wb: &mut Workbook, request: AutoFillRequest) -> Result<(), String> {
    let request = wb
        .infer_auto_fill_request(request)
        .map_err(|e| e.to_string())?;
    wb.apply_auto_fill(&request).map_err(|e| e.to_string())?;
    Ok(())
}

#[test]
fn numbers_infer_integer_decimal_and_negative_steps_from_native_values() {
    for (first, second, expected) in [(1.0, 3.0, 7.0), (0.25, 0.75, 1.75), (4.5, 3.0, 0.0)] {
        let mut wb = Workbook::new();
        wb.set_cell(0, "A1", Value::Number(first));
        wb.set_cell(0, "A2", Value::Number(second));
        extend(&mut wb, request(AutoFillSeries::IntegerStep, "A2", "A4")).unwrap();
        assert_eq!(wb.get_cell("Sheet1", "A4"), Value::Number(expected));
        assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(first));
        assert_eq!(wb.get_cell("Sheet1", "A2"), Value::Number(second));
    }
}

#[test]
fn horizontal_series_preserves_padded_numbered_labels() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Text("Item001kg".into()));
    wb.set_cell(0, "B1", Value::Text("Item003kg".into()));
    extend(&mut wb, request(AutoFillSeries::TextNumber, "B1", "D1")).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Text("Item005kg".into()));
    assert_eq!(wb.get_cell("Sheet1", "D1"), Value::Text("Item007kg".into()));
}

#[test]
fn text_series_grows_digit_width_and_can_decrease() {
    for (a, b, expected) in [
        ("Item98", "Item99", "Item100"),
        ("Item003", "Item002", "Item001"),
    ] {
        let mut wb = Workbook::new();
        wb.set_cell(0, "A1", Value::Text(a.into()));
        wb.set_cell(0, "A2", Value::Text(b.into()));
        extend(&mut wb, request(AutoFillSeries::TextNumber, "A2", "A3")).unwrap();
        assert_eq!(wb.get_cell("Sheet1", "A3"), Value::Text(expected.into()));
    }
}

#[test]
fn linear_trend_uses_all_four_samples_not_the_last_difference() {
    let mut wb = Workbook::new();
    for (index, value) in [0.0, 2.0, 1.0, 5.0].iter().enumerate() {
        wb.set_cell(0, &format!("A{}", index + 1), Value::Number(*value));
    }
    extend(&mut wb, request(AutoFillSeries::LinearTrend, "A4", "A6")).unwrap();
    let Value::Number(fifth) = wb.get_cell("Sheet1", "A5") else {
        panic!("expected number")
    };
    let Value::Number(sixth) = wb.get_cell("Sheet1", "A6") else {
        panic!("expected number")
    };
    assert!((fifth - 5.5).abs() < 1e-10);
    assert!((sixth - 6.9).abs() < 1e-10);
    assert_eq!(wb.get_cell("Sheet1", "A3"), Value::Number(1.0));
}

#[test]
fn inconsistent_samples_and_formula_sources_leave_targets_unchanged() {
    let mut wb = Workbook::new();
    for (addr, value) in [("A1", 1.0), ("A2", 3.0), ("A3", 8.0), ("A4", 99.0)] {
        wb.set_cell(0, addr, Value::Number(value));
    }
    assert!(extend(&mut wb, request(AutoFillSeries::IntegerStep, "A3", "A4")).is_err());
    assert_eq!(wb.get_cell("Sheet1", "A4"), Value::Number(99.0));
    assert!(wb.set_formula(0, "A2", "=3"));
    assert!(extend(&mut wb, request(AutoFillSeries::IntegerStep, "A2", "A4")).is_err());
    assert_eq!(wb.get_cell("Sheet1", "A4"), Value::Number(99.0));
    wb.set_cell(0, "A1", Value::Text("Item001".into()));
    wb.set_cell(0, "A2", Value::Text("Other003".into()));
    assert!(extend(&mut wb, request(AutoFillSeries::TextNumber, "A2", "A4")).is_err());
    assert_eq!(wb.get_cell("Sheet1", "A4"), Value::Number(99.0));
}

#[test]
fn insufficient_constant_and_overflowing_series_are_rejected() {
    for (first, second) in [(1.0, 1.0), (1e308, -1e308)] {
        let mut wb = Workbook::new();
        wb.set_cell(0, "A1", Value::Number(first));
        wb.set_cell(0, "A2", Value::Number(second));
        assert!(extend(&mut wb, request(AutoFillSeries::IntegerStep, "A2", "A4")).is_err());
        assert_eq!(wb.get_cell("Sheet1", "A3"), Value::Null);
        assert!(extend(&mut wb, request(AutoFillSeries::LinearTrend, "A2", "A4")).is_err());
    }
}

#[test]
fn oversized_and_two_dimensional_requests_fail_before_reading_samples() {
    let wb = Workbook::new();
    let mut input = request(AutoFillSeries::IntegerStep, "A2", "A4");
    input.target_range = range("A1", "B1048576");
    assert!(wb
        .infer_auto_fill_request(input.clone())
        .unwrap_err()
        .to_string()
        .contains("engine cap"));
    input.source_range = range("A1", "B2");
    input.target_range = range("A1", "B4");
    assert!(wb
        .infer_auto_fill_request(input)
        .unwrap_err()
        .to_string()
        .contains("one source column"));
}
