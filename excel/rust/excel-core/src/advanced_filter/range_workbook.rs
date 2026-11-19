//! Workbook integration for worksheet criteria, matching, and output planning.
use super::super::*;

#[path = "range_apply.rs"]
mod range_apply;
#[path = "range_conditions.rs"]
mod range_conditions;
#[path = "range_copy.rs"]
mod range_copy;
#[path = "range_predicate.rs"]
mod range_predicate;
#[path = "range_records.rs"]
mod range_records;
#[path = "range_scan.rs"]
mod range_scan;
#[path = "range_structure.rs"]
mod range_structure;
pub(in crate::workbook) use range_structure::CriteriaShift;
