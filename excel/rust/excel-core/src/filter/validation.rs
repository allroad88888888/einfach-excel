//! Leaf validation shared by apply, grouped criteria and snapshot restoration.
use super::{ColumnFilterRule, FilterError};
use crate::advanced_filter::MAX_SELECTION_BYTES;

pub(crate) fn validate_rule(rule: &ColumnFilterRule) -> Result<(), FilterError> {
    let valid = rule.col_index() < crate::sheet::EXCEL_MAX_COLS && match rule {
        ColumnFilterRule::Equals { value, .. } | ColumnFilterRule::Contains { value, .. } =>
            value.encode_utf16().count() <= 32767,
        ColumnFilterRule::List { values, .. } => values.len() <= 1000
            && values.iter().map(String::len).sum::<usize>() <= MAX_SELECTION_BYTES
            && values.iter().all(|value| value.encode_utf16().count() <= 32767),
        ColumnFilterRule::Range { min, max, .. } => (min.is_some() || max.is_some())
            && min.is_none_or(f64::is_finite) && max.is_none_or(f64::is_finite)
            && !matches!((min, max), (Some(min), Some(max)) if min > max),
        ColumnFilterRule::Top { amount, .. } => amount.is_valid(),
        ColumnFilterRule::DatePeriod { .. } => true,
    };
    if valid { Ok(()) } else { Err(FilterError::InvalidGroups) }
}

pub(crate) fn validate_flat_rules(rules: &[ColumnFilterRule]) -> Result<(), FilterError> {
    // Existing flat rules predate grouped payload budgets. Preserve their shape
    // compatibility; every newly supported typed criterion uses the common gate.
    for rule in rules {
        if matches!(rule, ColumnFilterRule::Top { .. } | ColumnFilterRule::DatePeriod { .. }) {
            validate_rule(rule)?;
        }
    }
    Ok(())
}
