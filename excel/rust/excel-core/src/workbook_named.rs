//! Defined-name registry types and name-validation constants.

use super::*;

pub(super) type FormulaOverlay<'a> = HashMap<(usize, CellAddress), Option<&'a Expr>>;

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct NamedEntry {
    pub(super) canonical_name: String,
    pub(super) definition: NamedDefinition,
}

/// 名称只有一份定义。范围保存稳定表身份，不保存当时读到的单元格值。
#[derive(Clone, Debug, PartialEq)]
pub(crate) enum NamedDefinition {
    Value(Value),
    Range {
        sheet_key: u64,
        range: Option<CellRange>,
    },
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
            WorkbookError::InvalidName => write!(f, "the defined name is invalid"),
            WorkbookError::ParseFailed => write!(f, "formula text failed to parse"),
            WorkbookError::EvalFailed(e) => write!(f, "formula evaluation surfaced {}", e),
            WorkbookError::MutationDuringCustomCall => write!(
                f,
                "workbook mutations are forbidden while a custom-formula callback is executing"
            ),
            WorkbookError::NameConflict => {
                write!(f, "the name is already in use")
            }
        }
    }
}

impl std::error::Error for WorkbookError {}

pub(super) const MAX_TABLES: usize = 256;
pub(super) const GRID_MAX_COL: u32 = 16_383;
pub(super) const GRID_MAX_ROW: u32 = 1_048_575;
