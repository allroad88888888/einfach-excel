//! Input and result of the native worksheet subtotal command.
use super::layout_contract::{SubtotalCalculation, SubtotalPlacement};
use crate::shift::ShiftEdit;
use crate::CellRange;

#[derive(Debug)]
pub struct SubtotalSettings {
    pub group_by_column: u32,
    pub calculation: SubtotalCalculation,
    pub placement: SubtotalPlacement,
    pub replace: bool,
    pub total_suffix: String,
    pub grand_total: String,
}

#[derive(Debug)]
pub enum SubtotalAction {
    Apply(SubtotalSettings),
    Remove,
}

#[derive(Debug)]
pub struct SubtotalRequest {
    pub sheet: usize,
    pub selection: CellRange,
    pub row_count: u32,
    pub col_count: u32,
    pub action: SubtotalAction,
}

#[derive(Debug)]
pub struct SubtotalField {
    pub column: u32,
    pub name: String,
}

#[derive(Debug)]
pub struct SubtotalList {
    pub range: CellRange,
    pub fields: Vec<SubtotalField>,
    pub placement: Option<SubtotalPlacement>,
    pub notice: Option<&'static str>,
}

#[derive(Debug)]
pub struct SubtotalReport {
    pub range: CellRange,
    pub edits: Vec<ShiftEdit>,
}
