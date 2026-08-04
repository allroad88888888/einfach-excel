//! Defined-name registry types and name-validation constants.

use super::*;

pub(super) type FormulaOverlay<'a> = HashMap<(usize, CellAddress), Option<&'a Expr>>;

#[derive(Clone, Debug)]
pub(crate) struct NamedEntry {
    pub(super) canonical_name: String,
    pub(super) value: Value,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum WorkbookError {
    ReservedName,
    InvalidName,
    ParseFailed,
    EvalFailed(ValueError),
    MutationDuringCustomCall,
    NameConflict,
}

impl std::fmt::Display for WorkbookError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            WorkbookError::ReservedName => write!(f, "name collides with a built-in function name"),
            WorkbookError::InvalidName => write!(
                f,
                "name must match [A-Za-z_][A-Za-z0-9_]* and be 1..=255 chars"
            ),
            WorkbookError::ParseFailed => write!(f, "formula text failed to parse"),
            WorkbookError::EvalFailed(e) => write!(f, "formula evaluation surfaced {}", e),
            WorkbookError::MutationDuringCustomCall => write!(
                f,
                "workbook mutations are forbidden while a custom-formula callback is executing"
            ),
            WorkbookError::NameConflict => {
                write!(f, "name collides with an existing Excel Table name")
            }
        }
    }
}

impl std::error::Error for WorkbookError {}

pub(super) const MAX_TABLES: usize = 256;
pub(super) const GRID_MAX_COL: u32 = 16_383;
pub(super) const GRID_MAX_ROW: u32 = 1_048_575;
