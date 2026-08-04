//! Workbook-level error and totals-function types.

use super::*;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HiddenRowsError {
    MutationDuringCustomCall,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TableError {
    TooManyTables,
    InvalidName,
    ReservedName,
    NameLikeCellRef,
    NameConflict,
    RangeOverlap,
    SheetNotFound,
    NotFound,
    ColumnNotFound,
    DuplicateColumn,
    InvalidColumnName,
    TotalsRowBlocked,
    NoTotalsRow,
    MutationDuringCustomCall,
    MalformedSnapshot,
}

impl std::fmt::Display for TableError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::TooManyTables => write!(f, "workbook already holds the maximum of {MAX_TABLES} tables"),
            Self::InvalidName => write!(f, "table name must match [A-Za-z_][A-Za-z0-9_]* and be 1..=255 chars"),
            Self::ReservedName => write!(f, "table name collides with a built-in function name"),
            Self::NameLikeCellRef => write!(f, "table name parses as a cell reference"),
            Self::NameConflict => write!(f, "table name collides with an existing table or defined name"),
            Self::RangeOverlap => write!(f, "table range overlaps an existing table on the same sheet"),
            Self::SheetNotFound => write!(f, "sheet index is outside the workbook"),
            Self::NotFound => write!(f, "no table registered under that name"),
            Self::ColumnNotFound => write!(f, "no column of that table matches the supplied name"),
            Self::DuplicateColumn => write!(f, "the new column name collides with another column of the table"),
            Self::InvalidColumnName => write!(f, "column name must not be empty"),
            Self::TotalsRowBlocked => write!(f, "the row below the table is occupied; clear it before adding a totals row"),
            Self::NoTotalsRow => write!(f, "the table has no totals row; enable it first"),
            Self::MutationDuringCustomCall => write!(f, "table registry mutations are forbidden while a custom-formula callback is executing"),
            Self::MalformedSnapshot => write!(f, "table snapshot entry is malformed: column count does not match the range width"),
        }
    }
}

impl std::error::Error for TableError {}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TotalsFunction {
    None,
    Average,
    Count,
    CountNums,
    Max,
    Min,
    Sum,
    StdDev,
    Var,
}

impl TotalsFunction {
    pub fn subtotal_code(self) -> Option<u32> {
        match self {
            Self::None => None,
            Self::Average => Some(101),
            Self::CountNums => Some(102),
            Self::Count => Some(103),
            Self::Max => Some(104),
            Self::Min => Some(105),
            Self::StdDev => Some(107),
            Self::Sum => Some(109),
            Self::Var => Some(110),
        }
    }

    pub fn id(self) -> &'static str {
        match self {
            Self::None => "none",
            Self::Average => "average",
            Self::Count => "count",
            Self::CountNums => "countNums",
            Self::Max => "max",
            Self::Min => "min",
            Self::Sum => "sum",
            Self::StdDev => "stdDev",
            Self::Var => "var",
        }
    }

    pub fn from_id(id: &str) -> Option<Self> {
        Some(match id {
            "none" => Self::None,
            "average" => Self::Average,
            "count" => Self::Count,
            "countNums" => Self::CountNums,
            "max" => Self::Max,
            "min" => Self::Min,
            "sum" => Self::Sum,
            "stdDev" => Self::StdDev,
            "var" => Self::Var,
            _ => return None,
        })
    }
}
