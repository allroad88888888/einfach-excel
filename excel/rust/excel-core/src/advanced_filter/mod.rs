//! Two-level advanced filtering; existing flat rules remain one AND clause.
use crate::filter::{row_matches_rules, ColumnFilterRule, FilterError, SheetAutoFilter};
use std::collections::BTreeSet;

#[derive(Clone, Debug, PartialEq)]
pub struct ColumnFilterGroup {
    pub rules: Vec<ColumnFilterRule>,
}

/// Borrow one authoritative condition representation, never a flattened mirror.
#[derive(Clone, Copy)]
pub(crate) enum FilterCriteria<'a> {
    Flat(&'a [ColumnFilterRule]),
    Groups(&'a [ColumnFilterGroup]),
}

impl<'a> FilterCriteria<'a> {
    pub(crate) fn from_filter(filter: &'a SheetAutoFilter) -> Self {
        if filter.groups().is_empty() { Self::Flat(filter.rules()) }
        else { Self::Groups(filter.groups()) }
    }

    pub(crate) fn rules(self) -> impl Iterator<Item = &'a ColumnFilterRule> {
        let (flat, groups) = match self {
            Self::Flat(rules) => (rules, &[][..]),
            Self::Groups(groups) => (&[][..], groups),
        };
        flat.iter().chain(groups.iter().flat_map(|group| group.rules.iter()))
    }

    pub(crate) fn is_empty(self) -> bool {
        match self { Self::Flat(rules) => rules.is_empty(), Self::Groups(groups) => groups.is_empty() }
    }

    pub(crate) fn columns(self) -> BTreeSet<u32> {
        self.rules().map(ColumnFilterRule::col_index).collect()
    }

    pub(crate) fn matches(self, read: impl Fn(u32) -> String) -> bool {
        match self {
            Self::Flat(rules) => row_matches_rules(rules, read),
            // Empty group is never a vacuous match, including untrusted restored data.
            Self::Groups(groups) => groups.is_empty() || groups.iter()
                .any(|group| !group.rules.is_empty() && row_matches_rules(&group.rules, &read)),
        }
    }

    pub(crate) fn state(self, hidden: BTreeSet<u32>) -> SheetAutoFilter {
        match self {
            Self::Flat(rules) => SheetAutoFilter::new(rules.to_vec(), hidden),
            Self::Groups(groups) => SheetAutoFilter::new_grouped(groups.to_vec(), hidden),
        }
    }
}

/// Bound both evaluation complexity and persisted condition payloads before a scan.
pub fn validate_groups(groups: &[ColumnFilterGroup]) -> Result<(), FilterError> {
    if groups.len() > 8 || groups.iter().any(|group| group.rules.is_empty() || group.rules.len() > 8)
        || groups.iter().map(|group| group.rules.len()).sum::<usize>() > 32 {
        return Err(FilterError::InvalidGroups);
    }
    for rule in groups.iter().flat_map(|group| &group.rules) {
        let valid = rule.col_index() < crate::sheet::EXCEL_MAX_COLS && match rule {
            ColumnFilterRule::Equals { value, .. } | ColumnFilterRule::Contains { value, .. } =>
                value.encode_utf16().count() <= 32767,
            ColumnFilterRule::List { values, .. } => values.len() <= 1000
                && values.iter().map(String::len).sum::<usize>() <= MAX_SELECTION_BYTES
                && values.iter().all(|value| value.encode_utf16().count() <= 32767),
            ColumnFilterRule::Range { min, max, .. } => (min.is_some() || max.is_some())
                && min.is_none_or(f64::is_finite) && max.is_none_or(f64::is_finite)
                && !matches!((min, max), (Some(min), Some(max)) if min > max),
        };
        if !valid { return Err(FilterError::InvalidGroups); }
    }
    // Before/after snapshots must fit the existing 32 MiB native undo budget.
    if groups.iter().flat_map(|group| &group.rules).map(rule_retained_bytes).sum::<usize>() > 8 * MAX_SELECTION_BYTES {
        return Err(FilterError::InvalidGroups);
    }
    Ok(())
}

pub const MAX_SELECTION_BYTES: usize = 1_048_576;

impl SheetAutoFilter {
    /// A deleted last condition removes its group; it must not become an always-true OR branch.
    pub(crate) fn retain_conditions(&mut self, mut keep: impl FnMut(&mut ColumnFilterRule) -> bool) {
        self.rules_mut().retain_mut(&mut keep);
        self.groups_mut().retain_mut(|group| {
            group.rules.retain_mut(&mut keep);
            !group.rules.is_empty()
        });
    }
}

pub(crate) fn rule_retained_bytes(rule: &ColumnFilterRule) -> usize {
    std::mem::size_of::<ColumnFilterRule>() + match rule {
        ColumnFilterRule::Equals { value, .. } | ColumnFilterRule::Contains { value, .. } => value.len(),
        ColumnFilterRule::List { values, .. } => values.iter().map(|value| value.len() + 24).sum(),
        ColumnFilterRule::Range { .. } => 0,
    }
}

mod workbook;
