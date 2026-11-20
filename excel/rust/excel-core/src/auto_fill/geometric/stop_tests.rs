//! Geometric Stop comparisons keep distinct terms while allowing arithmetic noise.
use super::*;
use crate::workbook_history::WorkbookHistory;

fn addr(value: &str) -> CellAddress { CellAddress::parse(value).unwrap() }
fn input(ratio: f64, stop: f64) -> AutoFillRequest {
    AutoFillRequest {
        named_lists: crate::AutoFillNamedLists::empty(),
        sheet_idx: 0,
        source_range: CellRange::single(addr("A1")),
        target_range: CellRange::new(addr("A1"), addr("A6")),
        direction: AutoFillDirection::Down,
        series: AutoFillSeries::Geometric { stop: Some(stop) },
        step: Some(ratio), text_pattern: None, list: None,
    }
}
fn filled(start: f64, ratio: f64, stop: f64, expected: &[f64]) {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Number(start));
    for row in 2..=6 { book.set_cell(0, &format!("A{row}"), Value::Number(901.0)); }
    let mut history = WorkbookHistory::default();
    let report = history.apply_auto_fill(&mut book, &input(ratio, stop)).unwrap();
    assert_eq!(report.written, expected.len());
    assert_eq!(book.sheet(0).unwrap().peek_value(addr("A1")), Value::Number(start));
    for (index, value) in expected.iter().enumerate() {
        assert_eq!(book.sheet(0).unwrap().peek_value(addr(&format!("A{}", index + 2))),
            Value::Number(*value));
    }
    assert_eq!(book.sheet(0).unwrap().peek_value(addr(&format!("A{}", expected.len() + 2))),
        Value::Number(901.0));
    assert_eq!(history.undo_count(), usize::from(!expected.is_empty()));
    if !expected.is_empty() {
        history.undo(&mut book).unwrap();
        assert_eq!(book.sheet(0).unwrap().peek_value(addr("A2")), Value::Number(901.0));
        history.redo(&mut book).unwrap();
        assert_eq!(book.sheet(0).unwrap().peek_value(addr("A2")), Value::Number(expected[0]));
    }
}

#[test]
fn near_unit_ratio_does_not_merge_the_start_or_distinct_generated_terms_with_stop() {
    filled(2.0, 1.00000000001, 2.00000000005, &[2.00000000002, 2.00000000004]);
    for start in [1.0, 2.0, -1.0, -2.0] {
        for ratio in [1.0 + f64::EPSILON, 1.0 - f64::EPSILON] {
            let first = start * ratio;
            let second = first * ratio;
            let third = second * ratio;
            assert_ne!(start, first);
            assert_ne!(first, second);
            assert_ne!(second, third);
            filled(start, ratio, third, &[first, second, third]);
        }
    }
}

#[test]
fn distinguishable_overshoots_preserve_the_destination_for_each_monotonic_direction() {
    for (start, ratio, stop) in [
        (2.0, 2.0, 3.99999999995), (-2.0, 2.0, -3.99999999995),
        (8.0, 0.5, 4.00000000005), (-8.0, 0.5, -4.00000000005),
    ] {
        filled(start, ratio, stop, &[]);
    }
}

#[test]
fn endpoint_noise_scales_to_small_normal_and_subnormal_magnitudes() {
    filled(1e-12, 2.0, 5e-12, &[2e-12, 4e-12]);
    for start in [0.1, 1e-301, 1e-310] {
        let stop = if start == 0.1 { 0.3 } else if start == 1e-301 { 3e-301 } else { 3e-310 };
        filled(start, 3.0, stop, &[start * 3.0]);
        filled(-start, 3.0, -stop, &[-start * 3.0]);
    }
    let tiny = f64::from_bits(1);
    filled(tiny * 8.0, 0.5, 0.0, &[tiny * 4.0, tiny * 2.0, tiny, 0.0]);
    filled(-tiny * 8.0, 0.5, -0.0, &[-tiny * 4.0, -tiny * 2.0, -tiny, -0.0]);
}

#[test]
fn finite_stop_truncates_before_an_infinite_candidate_without_approximate_infinity() {
    assert!(!at_stop(1e308, f64::INFINITY, 10.0, f64::MAX));
    assert!(!at_stop(-1e308, f64::NEG_INFINITY, 10.0, -f64::MAX));
    filled(1e307, 10.0, 1.1e308, &[1e307 * 10.0]);
    filled(-1e307, 10.0, -1.1e308, &[-1e307 * 10.0]);
}
