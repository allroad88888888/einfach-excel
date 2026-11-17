/// One column filter condition, the Rust twin of the TypeScript wire type
/// `ColumnFilterRule` (`excel/spreadsheet-ui-core/src/filter-sort/types.ts:12-16`).
///
/// `case_sensitive` collapses the wire's
/// optional `caseSensitive?: boolean` — absent and `false` behave
/// identically there (`caseSensitive ? value : value.toLocaleLowerCase()`),
/// so a plain `bool` loses nothing.
#[derive(Clone, Debug, PartialEq)]
pub enum ColumnFilterRule {
    /// Whole-value equality, case-folded unless `case_sensitive`.
    Equals {
        col_index: u32,
        value: String,
        case_sensitive: bool,
    },
    /// Substring containment, case-folded unless `case_sensitive`.
    Contains {
        col_index: u32,
        value: String,
        case_sensitive: bool,
    },
    /// Inclusive numeric band. A non-numeric cell never matches. Either
    /// bound may be absent, which makes that side unbounded.
    Range {
        col_index: u32,
        min: Option<f64>,
        max: Option<f64>,
    },
    /// Membership in an explicit value list. RAW string comparison — see
    /// the module note about the deliberate inconsistency with `Equals`.
    List { col_index: u32, values: Vec<String> },
    /// Rank finite numeric cell results over the complete data body.
    Top { col_index: u32, direction: FilterTopDirection, amount: FilterTopAmount },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FilterTopDirection { Top, Bottom }

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FilterTopAmount { Items(u16), Percent(u8) }

impl FilterTopAmount {
    pub fn is_valid(self) -> bool {
        match self {
            Self::Items(value) => (1..=500).contains(&value),
            Self::Percent(value) => (1..=100).contains(&value),
        }
    }

    pub(crate) fn quota(self, population: usize) -> usize {
        match self {
            Self::Items(value) => usize::from(value).min(population),
            Self::Percent(value) => (population * usize::from(value)).div_ceil(100),
        }
    }
}

impl ColumnFilterRule {
    /// The 0-based column this rule reads.
    pub fn col_index(&self) -> u32 {
        match self {
            ColumnFilterRule::Equals { col_index, .. }
            | ColumnFilterRule::Contains { col_index, .. }
            | ColumnFilterRule::Range { col_index, .. }
            | ColumnFilterRule::Top { col_index, .. }
            | ColumnFilterRule::List { col_index, .. } => *col_index,
        }
    }
}

