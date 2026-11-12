use super::*;
use crate::workbook_history::WorkbookHistory;

fn addr(value: &str) -> CellAddress { CellAddress::parse(value).unwrap() }
fn range(first: &str, last: &str) -> CellRange { CellRange::new(addr(first), addr(last)) }
fn request(ratio: f64, stop: Option<f64>) -> AutoFillRequest {
    AutoFillRequest {
        named_lists: crate::AutoFillNamedLists::empty(),
        sheet_idx: 0, source_range: range("A1", "A1"), target_range: range("A1", "A6"),
        direction: AutoFillDirection::Down, series: AutoFillSeries::Geometric { stop },
        step: Some(ratio), text_pattern: None, list: None,
    }
}
fn number(wb: &Workbook, at: &str) -> Value { wb.sheet(0).unwrap().peek_value(addr(at)) }

#[test]
fn geometric_decimal_prefix_preserves_start_sentinels_formats_and_one_history() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(2.0));
    wb.set_cell(0, "A5", Value::Number(91.0));
    wb.set_cell(0, "B2", Value::Number(92.0));
    let mut format = CellFormat::default();
    format.italic = true;
    wb.sheet_mut(0).unwrap().set_format("A1", format.clone());
    let mut history = WorkbookHistory::default();
    let report = history.apply_auto_fill(&mut wb, &request(1.5, Some(7.0))).unwrap();
    assert_eq!(history.undo_count(), 1);
    assert_eq!(report, AutoFillReport { write_range: Some(range("A2", "A4")), written: 3 });
    for (at, value) in [("A1", 2.0), ("A2", 3.0), ("A3", 4.5), ("A4", 6.75), ("A5", 91.0), ("B2", 92.0)] {
        assert_eq!(number(&wb, at), Value::Number(value));
    }
    assert!(wb.sheet(0).unwrap().effective_format("A4").italic);
    history.undo(&mut wb).unwrap();
    assert_eq!(number(&wb, "A2"), Value::Null);
    assert_eq!(number(&wb, "A5"), Value::Number(91.0));
    history.redo(&mut wb).unwrap();
    assert_eq!(number(&wb, "A4"), Value::Number(6.75));
}

#[test]
fn geometric_without_stop_accepts_finite_signed_zero_and_unit_parameters() {
    for (start, ratio, expected) in [
        (2.0, -2.0, vec![-4.0, 8.0, -16.0]),
        (2.0, 0.0, vec![0.0, 0.0, 0.0]),
        (2.0, 1.0, vec![2.0, 2.0, 2.0]),
        (0.0, 2.0, vec![0.0, 0.0, 0.0]),
        (-2.0, 2.0, vec![-4.0, -8.0, -16.0]),
        (8.0, 0.5, vec![4.0, 2.0, 1.0]),
    ] {
        let mut wb = Workbook::new();
        wb.set_cell(0, "A1", Value::Number(start));
        let mut input = request(ratio, None);
        input.target_range = range("A1", "A4");
        assert_eq!(wb.apply_auto_fill(&input).unwrap().written, 3);
        for (index, value) in expected.iter().enumerate() {
            assert_eq!(number(&wb, &format!("A{}", index + 2)), Value::Number(*value));
        }
    }
}

#[test]
fn geometric_monotonic_stop_is_inclusive_for_all_signs_and_decay() {
    for (start, ratio, stop, count, last) in [
        (2.0, 2.0, 20.0, 3, 16.0), (-2.0, 2.0, -20.0, 3, -16.0),
        (8.0, 0.5, 1.0, 3, 1.0), (-8.0, 0.5, -1.0, 3, -1.0),
        (0.1, 3.0, 0.3, 1, 0.3),
    ] {
        let mut wb = Workbook::new();
        wb.set_cell(0, "A1", Value::Number(start));
        let report = wb.apply_auto_fill(&request(ratio, Some(stop))).unwrap();
        assert_eq!(report.written, count);
        let Value::Number(actual) = number(&wb, &format!("A{}", count + 1)) else { panic!() };
        assert!(steps_match(actual, last));
        assert_eq!(number(&wb, &format!("A{}", count + 2)), Value::Null);
    }
}

#[test]
fn geometric_stop_noops_and_ambiguous_combinations_never_allocate_history() {
    for (start, ratio, stop, valid) in [
        (2.0, 2.0, 2.0, true), (2.0, 2.0, 1.0, true),
        (-2.0, 2.0, -1.0, true), (8.0, 0.5, 9.0, true),
        (2.0, -2.0, 20.0, false), (2.0, 0.0, 20.0, false),
        (2.0, 1.0, 20.0, false), (0.0, 2.0, 20.0, false),
    ] {
        let mut wb = Workbook::new();
        wb.set_cell(0, "A1", Value::Number(start));
        let mut history = WorkbookHistory::default();
        let result = history.apply_auto_fill(&mut wb, &request(ratio, Some(stop)));
        assert_eq!(result.is_ok(), valid);
        if let Ok(report) = result { assert_eq!(report.written, 0); assert_eq!(report.write_range, None); }
        assert_eq!(history.undo_count(), 0);
        assert_eq!(number(&wb, "A2"), Value::Null);
    }
}

#[test]
fn geometric_overflow_and_nonfinite_inputs_are_atomic_but_stopped_out_overflow_is_ignored() {
    for (start, ratio, stop) in [
        (1e308, 2.0, None), (1e306, 10.0, None), (2.0, f64::INFINITY, None),
        (2.0, f64::NAN, None), (f64::INFINITY, 2.0, None),
        (2.0, 2.0, Some(f64::INFINITY)),
    ] {
        let mut wb = Workbook::new();
        wb.set_cell(0, "A1", Value::Number(start));
        wb.set_cell(0, "A2", Value::Number(99.0));
        assert!(wb.apply_auto_fill(&request(ratio, stop)).is_err());
        assert_eq!(number(&wb, "A2"), Value::Number(99.0));
    }
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(1e307));
    assert_eq!(wb.apply_auto_fill(&request(10.0, Some(1.1e308))).unwrap().written, 1);
}

#[test]
fn geometric_right_and_unsupported_reverse_or_multiple_sources() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(2.0));
    let mut input = request(2.0, None);
    input.direction = AutoFillDirection::Right;
    input.target_range = range("A1", "D1");
    assert_eq!(wb.apply_auto_fill(&input).unwrap().written, 3);
    assert_eq!(number(&wb, "D1"), Value::Number(16.0));
    input.source_range = range("A1", "B1");
    assert!(wb.apply_auto_fill(&input).is_err());
    input.source_range = range("D1", "D1");
    input.direction = AutoFillDirection::Left;
    assert!(wb.apply_auto_fill(&input).is_err());
}
