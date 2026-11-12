//! Explicit calendar plans use the shared atomic destination constraints.
use super::*;
use crate::data_validation::{DataValidationKind, DataValidationOperator, DataValidationRule};
use crate::protection::ProtectionChange;
use einfach_core::ArrayData;
use std::sync::Arc;

fn range(first: u32, last: u32) -> CellRange {
    CellRange::new(CellAddress::new(first, 0), CellAddress::new(last, 0))
}
fn request(series: AutoFillSeries) -> AutoFillRequest {
    AutoFillRequest {
        named_lists: crate::AutoFillNamedLists::empty(),
        sheet_idx: 0, source_range: range(0, 0), target_range: range(0, 2),
        direction: AutoFillDirection::Down, series, step: Some(1.0), text_pattern: None, list: None,
    }
}
fn book() -> Workbook {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Number(45352.5));
    book.set_cell(0, "A2", Value::Number(901.0));
    book
}
#[test]
fn new_calendar_units_allow_locked_source_but_reject_any_locked_destination_atomically() {
    for series in [AutoFillSeries::DateWeekday, AutoFillSeries::DateYear] {
        let mut accepted = book();
        accepted.change_protection(0, ProtectionChange::AllowRange { range: range(1, 2).into() }).unwrap();
        accepted.change_protection(0, ProtectionChange::Protect).unwrap();
        assert_eq!(accepted.apply_auto_fill(&request(series)).unwrap().written, 2);
        let mut rejected = book();
        rejected.change_protection(0, ProtectionChange::AllowRange { range: range(1, 1).into() }).unwrap();
        rejected.change_protection(0, ProtectionChange::Protect).unwrap();
        assert!(rejected.apply_auto_fill(&request(series)).is_err());
        assert_eq!(rejected.sheet(0).unwrap().peek_value(CellAddress::new(1, 0)), Value::Number(901.0));
    }
}
#[test]
fn new_calendar_units_roll_back_the_whole_candidate_on_later_validation_failure() {
    for series in [AutoFillSeries::DateWeekday, AutoFillSeries::DateYear] {
        let mut book = book();
        let rule = DataValidationRule { kind: DataValidationKind::WholeNumber { min: 0.0, max: 1.0 },
            operator: DataValidationOperator::Between, ignore_blank: false, options: Default::default() };
        book.sheet_mut(0).unwrap().set_data_validation(range(2, 2), Some(rule)).unwrap();
        assert!(book.apply_auto_fill(&request(series)).is_err());
        assert_eq!(book.sheet(0).unwrap().peek_value(CellAddress::new(1, 0)), Value::Number(901.0));
    }
}
#[test]
fn new_calendar_units_reject_later_spill_and_merge_without_writing_the_first_target() {
    for series in [AutoFillSeries::DateWeekday, AutoFillSeries::DateYear] {
        let mut spilled = book();
        spilled.sheet_mut(0).unwrap().set_array("A3", Arc::new(ArrayData::new(2, 1,
            vec![Value::Number(1.0), Value::Number(2.0)]))).unwrap();
        assert!(spilled.apply_auto_fill(&request(series)).is_err());
        assert_eq!(spilled.sheet(0).unwrap().peek_value(CellAddress::new(1, 0)), Value::Number(901.0));
        let mut merged = book();
        merged.sheet_mut(0).unwrap().restore_merged_ranges(vec![range(2, 3)]).unwrap();
        assert!(merged.apply_auto_fill(&request(series)).is_err());
        assert_eq!(merged.sheet(0).unwrap().peek_value(CellAddress::new(1, 0)), Value::Number(901.0));
    }
}
