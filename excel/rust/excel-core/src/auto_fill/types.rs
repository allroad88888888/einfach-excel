//! Native auto-fill request and result contract.
use super::MAX_AUTO_FILL_CELLS;
use crate::{CellAddress, CellRange};
use std::fmt;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AutoFillDirection {
    Up,
    Down,
    Left,
    Right,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum AutoFillSeries {
    /// Explicit multiplication; Stop only supports a strictly monotonic sequence.
    Geometric { stop: Option<f64> },
    Copy,
    IntegerStep,
    DecimalStep,
    LinearTrend,
    DateDay,
    DateWeek,
    DateMonth,
    DateWeekday,
    DateYear,
    TextNumber,
    WeekdayName,
    MonthName,
    CustomList,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AutoFillTextPattern {
    pub prefix: String,
    pub suffix: String,
    pub width: u32,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AutoFillListWitness {
    pub list_name: String,
    pub values: Vec<String>,
    pub locale: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct AutoFillRequest {
    pub sheet_idx: usize,
    pub source_range: CellRange,
    pub target_range: CellRange,
    pub direction: AutoFillDirection,
    pub series: AutoFillSeries,
    pub step: Option<f64>,
    pub text_pattern: Option<AutoFillTextPattern>,
    pub list: Option<AutoFillListWitness>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AutoFillReport {
    pub write_range: Option<CellRange>,
    pub written: usize,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum AutoFillError {
    SheetOutOfRange,
    MutationDuringCustomCall,
    InvalidGeometry(&'static str),
    /// The target range spans more cells than [`MAX_AUTO_FILL_CELLS`]. Checked
    /// during geometry preflight, before any source or witness validation, so
    /// an oversized drag fails fast without touching the workbook.
    TooLarge {
        requested_cells: u64,
    },
    InvalidStep(&'static str),
    InvalidSource(&'static str),
    InvalidWitness(&'static str),
    FormulaParse,
    UnsupportedFormula,
    SpillTarget(CellAddress),
    UnsupportedSeries,
}

impl fmt::Display for AutoFillError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AutoFillError::SheetOutOfRange => write!(f, "sheet index is out of range"),
            AutoFillError::MutationDuringCustomCall => {
                f.write_str("workbook mutations are forbidden during a custom formula call")
            }
            AutoFillError::InvalidGeometry(message)
            | AutoFillError::InvalidStep(message)
            | AutoFillError::InvalidSource(message)
            | AutoFillError::InvalidWitness(message) => f.write_str(message),
            AutoFillError::TooLarge { requested_cells } => write!(
                f,
                "auto-fill target spans {requested_cells} cells but the engine cap is {MAX_AUTO_FILL_CELLS}"
            ),
            AutoFillError::FormulaParse => f.write_str("source formula could not be parsed"),
            AutoFillError::UnsupportedFormula => {
                f.write_str("source formula contains an unsupported expression")
            }
            AutoFillError::SpillTarget(addr) => {
                write!(f, "auto-fill target {addr} belongs to a spilled array")
            }
            AutoFillError::UnsupportedSeries => f.write_str("auto-fill series is not implemented"),
        }
    }
}

impl std::error::Error for AutoFillError {}

