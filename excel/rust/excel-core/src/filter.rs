//! Engine-owned column filter — E3 of
//! `excel/solid-excel/docs/archive/online-excel-parity/design-engine-hidden-rows.md`.
//!
//! This module is the Rust half of a CROSS-LANGUAGE PORT, not a fresh
//! design. Every function here has a named TypeScript original in
//! `excel/spreadsheet-ui-core/src/contracts/projection-helpers.ts`, and the
//! contract of this slice is that the two agree on every input the product
//! can produce. Where the original does something surprising it is copied
//! surprise and all; the divergences worth naming are called out inline:
//!
//!   - [`js_numeric_value`] reproduces JavaScript's `Number(string)`, which
//!     is NOT `str::parse::<f64>()`. `Number("")` is `0`, not an error;
//!     `Number("0x10")` is 16; `Number(" 12 ")` is 12; `Number("Infinity")`
//!     is infinite and therefore rejected by the `Number.isFinite` guard,
//!     while Rust's parser would happily accept `"inf"` and `"NaN"`.
//!   - [`ColumnFilterRule::List`] compares the RAW string, while `Equals`
//!     case-folds by default. That inconsistency is real product behaviour
//!     (`projection-helpers.ts:96-97` vs `:110`); "fixing" it here would be
//!     a silent behaviour change, so it is preserved verbatim.
//!   - [`js_trim`] is JavaScript's whitespace set, which differs from
//!     `char::is_whitespace` at exactly two code points (U+0085 and
//!     U+FEFF).
//!
//! The value the predicate compares against is [`crate::value_to_display`],
//! which is the same function the wasm `readSparseRange` boundary uses to
//! build the `display` string the TypeScript predicate reads TODAY. That is
//! what makes the port behaviour-preserving on the worker path: same bytes
//! in, same predicate, same answer.

use std::collections::BTreeSet;

mod rule;
mod legacy_number;
pub(crate) mod prepared;
pub(crate) mod validation;
pub use rule::{ColumnFilterRule, FilterTopAmount, FilterTopDirection};
pub use legacy_number::{js_numeric_value, js_trim};

/// `normalizeFilterText` (`projection-helpers.ts:87-89`).
///
/// JavaScript's `toLocaleLowerCase()` with no locale argument uses the
/// host default locale; `str::to_lowercase` is the locale-INDEPENDENT
/// Unicode default casing. They agree on everything the default (root /
/// en) locale does, including the two cases people expect to differ:
/// final sigma (`"ΟΔΟΣ"` → `"οδος"`) and dotted capital I (`"İ"` →
/// `"i\u{307}"`). They would diverge under a Turkish host locale, which
/// is a pre-existing property of the TypeScript side, not something this
/// port introduces — see the commit message for the measured corpus.
fn normalize_filter_text(value: &str, case_sensitive: bool) -> std::borrow::Cow<'_, str> {
    if case_sensitive {
        std::borrow::Cow::Borrowed(value)
    } else {
        std::borrow::Cow::Owned(value.to_lowercase())
    }
}

/// `filterRuleMatchesValue` (`projection-helpers.ts:91-112`), verbatim.
pub fn filter_rule_matches_value(rule: &ColumnFilterRule, value: &str) -> bool {
    match rule {
        ColumnFilterRule::Equals {
            value: needle,
            case_sensitive,
            ..
        } => {
            normalize_filter_text(value, *case_sensitive)
                == normalize_filter_text(needle, *case_sensitive)
        }
        ColumnFilterRule::Contains {
            value: needle,
            case_sensitive,
            ..
        } => normalize_filter_text(value, *case_sensitive)
            .contains(normalize_filter_text(needle, *case_sensitive).as_ref()),
        ColumnFilterRule::Range { min, max, .. } => {
            let Some(numeric) = js_numeric_value(value) else {
                return false;
            };
            if let Some(min) = min {
                if numeric < *min {
                    return false;
                }
            }
            if let Some(max) = max {
                if numeric > *max {
                    return false;
                }
            }
            true
        }
        // RAW comparison, deliberately NOT case-folded — see the module
        // note. `Equals` and `List` disagree about case in the product
        // today and the golden parity corpus pins that disagreement.
        ColumnFilterRule::List { values, .. } => values.iter().any(|candidate| candidate == value),
        // Typed ranks require the whole data domain; never coerce display text.
        ColumnFilterRule::Top { .. } => false,
    }
}

/// `isFilterSortSummaryRow` (`projection-helpers.ts:340-346`).
///
/// A PRODUCT HEURISTIC, not filter semantics: the last scanned row is
/// pinned permanently visible when its column-0 label trims and lower-cases
/// to `total` or `summary`. `row > 1` keeps a two-row sheet's only data row
/// from being mistaken for a summary. `label` is the column-0 display
/// string of `row`, which is why column 0 is always in the predicate
/// column set even when no rule reads it.
pub fn is_filter_sort_summary_row(label: &str, row: u32) -> bool {
    let label = js_trim(label).to_lowercase();
    row > 1 && (label == "total" || label == "summary")
}

/// `rowMatchesFilterSortRules` (`projection-helpers.ts:348-358`): every
/// rule must pass (AND). An empty rule list matches everything, which is
/// why "no rules" and "nothing hidden" are the same state.
pub fn row_matches_rules(rules: &[ColumnFilterRule], read_value: impl Fn(u32) -> String) -> bool {
    rules
        .iter()
        .all(|rule| filter_rule_matches_value(rule, &read_value(rule.col_index())))
}

/// The engine's stored per-sheet AutoFilter: the RULES plus the row set
/// they DERIVED when they were last applied.
///
/// Keeping the derived set next to the rules rather than recomputing it on
/// demand is the whole point of the snapshot semantics (#27): filter
/// visibility is taken once, when the rules are applied, and does not
/// follow later cell edits. A getter that re-ran the predicate would be
/// live by construction; a stored set cannot be.
///
/// 显式区域包含表头；None 保留旧整表扫描契约。区域与隐藏快照一起保存、撤销。
#[derive(Clone, Debug, Default, PartialEq)]
pub struct SheetAutoFilter {
    rules: Vec<ColumnFilterRule>,
    groups: Vec<crate::advanced_filter::ColumnFilterGroup>,
    hidden: BTreeSet<u32>,
    pub(crate) range: Option<crate::CellRange>,
}

impl SheetAutoFilter {
    pub(crate) fn new(rules: Vec<ColumnFilterRule>, hidden: BTreeSet<u32>) -> Self {
        SheetAutoFilter { rules, groups: Vec::new(), hidden, range: None }
    }

    pub(crate) fn new_grouped(groups: Vec<crate::advanced_filter::ColumnFilterGroup>, hidden: BTreeSet<u32>) -> Self {
        Self { rules: Vec::new(), groups, hidden, range: None }
    }

    pub fn groups(&self) -> &[crate::advanced_filter::ColumnFilterGroup] { &self.groups }
    pub fn has_conditions(&self) -> bool { !self.rules.is_empty() || !self.groups.is_empty() }
    pub(crate) fn groups_mut(&mut self) -> &mut Vec<crate::advanced_filter::ColumnFilterGroup> { &mut self.groups }

    pub fn range(&self) -> Option<crate::CellRange> { self.range }

    pub(crate) fn rules_mut(&mut self) -> &mut Vec<ColumnFilterRule> { &mut self.rules }

    /// The committed rules.
    pub fn rules(&self) -> &[ColumnFilterRule] {
        &self.rules
    }

    /// The rows those rules hid, ascending.
    pub fn hidden_rows(&self) -> Vec<u32> {
        self.hidden.iter().copied().collect()
    }

    pub(crate) fn hidden_set(&self) -> &BTreeSet<u32> {
        &self.hidden
    }

    pub(crate) fn set_hidden(&mut self, hidden: BTreeSet<u32>) {
        self.hidden = hidden;
    }

    pub(crate) fn hidden_set_mut(&mut self) -> &mut BTreeSet<u32> {
        &mut self.hidden
    }
}

/// Outcome of a completed [`crate::Workbook::apply_filter`] /
/// `reapply_filter` / `clear_filter`.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct FilterApplyReport {
    /// The rows the committed rules hid, ascending. Empty when no rule is
    /// active — which is the same statement as "the rules hid nothing",
    /// exactly as the TypeScript `hiddenRowIndices` contract says.
    pub hidden_rows: Vec<u32>,
    /// Rows the predicate scan covered, i.e. `max_non_empty_row + 1`. Rows
    /// at or beyond it were never judged and are never reported hidden.
    pub scanned_rows: u32,
    /// `scanned_rows * predicate_columns` — the number the budget gate
    /// below measures.
    pub predicate_cells: u32,
}

/// Rejections from the filter entry points. Structured rather than
/// stringly, and surfaced to JS through the `{ ok: false, code, message }`
/// convention `sortRange` established (`excel/rust/wasm/src/lib.rs`
/// § "Engine physical sort wire").
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FilterError {
    /// Groups must be nonempty, bounded, and contain valid leaf conditions.
    InvalidGroups,
    /// 区域必须包含表头与数据，条件列必须属于此区域。
    InvalidRange,
    /// A history transaction already owns the workbook mutation boundary.
    HistoryPending,
    /// `sheet_index` is not a sheet.
    InvalidSheet,
    /// A custom-formula callback tried to mutate the workbook it is being
    /// evaluated inside. Mirrors `TableError::MutationDuringCustomCall`.
    MutationDuringCustomCall,
    /// 保护规则是原生写入权限，允许编辑的格子也不能改筛选元数据。
    ProtectedWorksheet,
    /// The predicate scan would exceed [`MAX_FILTER_PREDICATE_CELLS`].
    /// NOTHING is mutated: the filter does not activate, no rules are
    /// stored, and the previous visibility stands. Truncating instead
    /// would silently show a wrong answer.
    SourceTooLarge {
        rows: u32,
        columns: u32,
        predicate_cells: u32,
    },
}

/// Predicate-scan budget, sunk from the host adapter
/// (`excel/spreadsheet-ui-core/src/rust-worker/adapter/worker/limits.ts`
/// `MAX_FILTER_SORT_PREDICATE_CELLS`, whose rejection code is
/// `FILTER_SORT_SOURCE_TOO_LARGE`). Same 50k budget as
/// `DEFAULT_MAX_PROJECTION_CELLS` and
/// `STATUS_BAR_AGGREGATE_MEMBERSHIP_CHECKS_MAX` in ui-core.
///
/// The measured quantity is `scanned_rows * predicate_columns`, where the
/// predicate columns are column 0 (the summary-row probe) plus every
/// distinct rule column — the host's arithmetic, transcribed. Crossing it
/// is a rejection, strictly greater than, so exactly 50 000 is allowed.
pub const MAX_FILTER_PREDICATE_CELLS: u32 = 50_000;

/// The distinct columns one scan has to read: column 0 for the
/// summary-row probe, plus every rule's column. Twin of the adapter's
/// `filterSortPredicateColumns`.
pub(crate) fn predicate_columns(rules: &[ColumnFilterRule]) -> BTreeSet<u32> {
    let mut cols = BTreeSet::new();
    cols.insert(0);
    for rule in rules {
        cols.insert(rule.col_index());
    }
    cols
}

#[cfg(test)]
#[path = "filter/legacy_tests.rs"]
mod tests;
