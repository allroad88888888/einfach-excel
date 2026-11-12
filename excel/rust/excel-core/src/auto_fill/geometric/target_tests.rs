//! A stopped-out target never participates in geometric write preflight.
use super::*;
use crate::data_validation::{DataValidationKind, DataValidationOperator, DataValidationRule};
use crate::protection::ProtectionChange;
use einfach_core::ArrayData;
use std::sync::Arc;

fn addr(value: &str) -> CellAddress { CellAddress::parse(value).unwrap() }
fn range(first: &str, last: &str) -> CellRange { CellRange::new(addr(first), addr(last)) }
fn request(stop: Option<f64>) -> AutoFillRequest {
    AutoFillRequest {
        sheet_idx: 0, source_range: range("A1", "A1"), target_range: range("A1", "A6"),
        direction: AutoFillDirection::Down, series: AutoFillSeries::Geometric { stop },
        step: Some(2.0), text_pattern: None, list: None,
    }
}
fn workbook() -> Workbook {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(2.0));
    wb.set_cell(0, "A4", Value::Number(99.0));
    wb
}

#[test]
fn geometric_stop_excludes_locked_targets_but_keeps_the_actual_prefix_protected() {
    let mut wb = workbook();
    wb.change_protection(0, ProtectionChange::AllowRange { range: range("A2", "A3").into() }).unwrap();
    wb.change_protection(0, ProtectionChange::Protect).unwrap();
    let mut history = crate::workbook_history::WorkbookHistory::default();
    let report = history.apply_auto_fill(&mut wb, &request(Some(8.0))).unwrap();
    assert_eq!(history.undo_count(), 1);
    assert_eq!(history.entries().next().unwrap().range, range("A2", "A3"));
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.sheet(0).unwrap().peek_value(addr("A2")), Value::Null);
    history.redo(&mut wb).unwrap();
    assert_eq!(report.written, 2);
    assert_eq!(wb.sheet(0).unwrap().peek_value(addr("A4")), Value::Number(99.0));
    assert!(wb.apply_auto_fill(&request(None)).is_err());
    // Stop before the first target also succeeds when the whole sheet is locked.
    wb.change_protection(0, ProtectionChange::Unprotect).unwrap();
    wb.change_protection(0, ProtectionChange::RemoveRange { index: 0 }).unwrap();
    wb.change_protection(0, ProtectionChange::Protect).unwrap();
    assert_eq!(wb.apply_auto_fill(&request(Some(2.0))).unwrap().written, 0);
    assert!(wb.apply_auto_fill(&request(Some(8.0))).is_err());
}

#[test]
fn geometric_stop_excludes_validation_but_in_prefix_validation_is_atomic() {
    let mut wb = workbook();
    let rule = DataValidationRule {
        kind: DataValidationKind::WholeNumber { min: 100.0, max: 200.0 },
        operator: DataValidationOperator::Between, ignore_blank: false, options: Default::default(),
    };
    wb.sheet_mut(0).unwrap().set_data_validation(range("A4", "A4"), Some(rule.clone())).unwrap();
    assert_eq!(wb.apply_auto_fill(&request(Some(8.0))).unwrap().written, 2);
    assert_eq!(wb.sheet(0).unwrap().peek_value(addr("A4")), Value::Number(99.0));
    wb.set_cell(0, "A2", Value::Number(77.0));
    wb.sheet_mut(0).unwrap().set_data_validation(range("A3", "A3"), Some(rule)).unwrap();
    assert!(wb.apply_auto_fill(&request(Some(8.0))).is_err());
    assert_eq!(wb.sheet(0).unwrap().peek_value(addr("A2")), Value::Number(77.0));
}

#[test]
fn geometric_stop_excludes_spill_and_merged_targets_but_rejects_them_in_prefix() {
    let mut wb = workbook();
    wb.sheet_mut(0).unwrap().set_array("A4", Arc::new(ArrayData::new(2, 1,
        vec![Value::Number(10.0), Value::Number(20.0)]))).unwrap();
    assert_eq!(wb.apply_auto_fill(&request(Some(8.0))).unwrap().written, 2);
    assert_eq!(wb.sheet(0).unwrap().peek_value(addr("A5")), Value::Number(20.0));
    assert!(wb.apply_auto_fill(&request(None)).is_err());
    let mut wb = workbook();
    wb.sheet_mut(0).unwrap().restore_merged_ranges(vec![range("A4", "A5")]).unwrap();
    assert_eq!(wb.apply_auto_fill(&request(Some(8.0))).unwrap().written, 2);
    assert!(wb.apply_auto_fill(&request(None)).is_err());
}
