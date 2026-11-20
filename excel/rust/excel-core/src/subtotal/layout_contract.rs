//! Native contract for calculating spatial subtotal layout from detail records.
use crate::CellRange;
use serde::{Deserialize, Serialize};
use std::ops::RangeInclusive;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SubtotalPlacement {
    Below,
    Above,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[repr(u8)]
pub enum SubtotalFunction {
    Average = 1,
    CountNumbers = 2,
    Count = 3,
    Max = 4,
    Min = 5,
    Product = 6,
    SampleStandardDeviation = 7,
    PopulationStandardDeviation = 8,
    Sum = 9,
    SampleVariance = 10,
    PopulationVariance = 11,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SubtotalCalculation {
    pub function: SubtotalFunction,
    /// Absolute worksheet columns, in the order of the committed calculation.
    pub columns: Vec<u32>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SubtotalLayer {
    pub group_by_column: u32,
    pub calculations: Vec<SubtotalCalculation>,
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct SubtotalLayout {
    pub target: CellRange,
    /// Row coordinates in the original sheet. Apply these from bottom to top.
    pub insertions: Vec<(u32, u32)>,
    pub summaries: Vec<SubtotalRow>,
    pub outline: Vec<RangeInclusive<u32>>,
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct SubtotalRow {
    pub row: u32,
    pub group_by_column: Option<u32>,
    pub details: RangeInclusive<u32>,
    pub label: SubtotalLabel,
    pub calculation: SubtotalCalculation,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum SubtotalLabel {
    Group { column: u32, value: String },
    GrandTotal { column: u32 },
}
