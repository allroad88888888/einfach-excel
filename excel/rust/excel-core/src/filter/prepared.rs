//! One immutable predicate preparation per scan, before any visibility is committed.
use super::{filter_rule_matches_value, ColumnFilterRule, FilterTopDirection};
use crate::advanced_filter::FilterCriteria;
use einfach_core::Value;
use std::collections::HashMap;
use std::ops::RangeInclusive;

pub(crate) struct PreparedFilter<'a> {
    groups: Vec<Vec<PreparedRule<'a>>>,
}

struct PreparedRule<'a> {
    rule: &'a ColumnFilterRule,
    cutoff: Option<f64>,
    date_bounds: Option<(f64, f64)>,
}

/// Array anchors expose the same top-left scalar as the cell projection.
fn numeric(value: &Value) -> Option<f64> {
    match value {
        Value::Number(number) if number.is_finite() => Some(*number),
        Value::Array(array) => array.get(0, 0).and_then(numeric),
        _ => None,
    }
}

impl<'a> PreparedFilter<'a> {
    pub(crate) fn new(criteria: FilterCriteria<'a>, rows: RangeInclusive<u32>,
        values: &HashMap<(u32, u32), Value>, today: Option<f64>) -> Self {
        let mut populations: HashMap<u32, Vec<f64>> = HashMap::new();
        for rule in criteria.rules() {
            if let ColumnFilterRule::Top { col_index, .. } = rule {
                populations.entry(*col_index).or_insert_with(|| {
                    let mut numbers: Vec<_> = rows.clone().filter_map(|row|
                        values.get(&(row, *col_index)).and_then(numeric)).collect();
                    numbers.sort_by(f64::total_cmp);
                    numbers
                });
            }
        }
        let prepare = |rules: &'a [ColumnFilterRule]| rules.iter().map(|rule| {
            let cutoff = if let ColumnFilterRule::Top { col_index, direction, amount } = rule {
                let numbers = &populations[col_index];
                let quota = amount.quota(numbers.len());
                if quota == 0 { None } else {
                    let index = match direction {
                        FilterTopDirection::Top => numbers.len() - quota,
                        FilterTopDirection::Bottom => quota - 1,
                    };
                    numbers.get(index).copied()
                }
            } else { None };
            let date_bounds = if let ColumnFilterRule::DatePeriod { period, .. } = rule {
                today.and_then(|today| period.bounds_at(today))
            } else { None };
            PreparedRule { rule, cutoff, date_bounds }
        }).collect();
        let groups = match criteria {
            FilterCriteria::Flat(rules) => vec![prepare(rules)],
            FilterCriteria::Groups(groups) => groups.iter().map(|group| prepare(&group.rules)).collect(),
        };
        Self { groups }
    }

    pub(crate) fn matches(&self, row: u32, values: &HashMap<(u32, u32), Value>) -> bool {
        self.groups.is_empty() || self.groups.iter().any(|group| group.iter().all(|prepared| {
            let value = values.get(&(row, prepared.rule.col_index())).unwrap_or(&Value::Null);
            match prepared.rule {
                ColumnFilterRule::DatePeriod { .. } => numeric(value).zip(prepared.date_bounds)
                    .is_some_and(|(number, (start, end))| number >= start && number < end),
                ColumnFilterRule::Top { direction, .. } => numeric(value)
                    .zip(prepared.cutoff).is_some_and(|(number, cutoff)| match direction {
                        FilterTopDirection::Top => number >= cutoff,
                        FilterTopDirection::Bottom => number <= cutoff,
                    }),
                rule => filter_rule_matches_value(rule, &crate::value_to_display(value)),
            }
        }))
    }
}
