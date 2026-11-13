//! Request-local list ranks. Only Text values match; unknowns use the ordinary sort order.
use std::cmp::Ordering;
use std::collections::HashMap;
use einfach_core::Value;
use crate::named_list::{fold_named_value, prepare_named_values, supported_locale_language};
pub use crate::named_list::NamedListError as CustomListError;

/// Validated using the same values, budget and locale contract as named-list fill.
/// Both maps are retained so a SortKey can change case sensitivity without rebuilding its list.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CustomList {
    exact: HashMap<String, usize>,
    folded: HashMap<String, usize>,
    language: String,
}

impl CustomList {
    pub fn new(values: &[String], locale: &str) -> Result<Self, CustomListError> {
        let folded = prepare_named_values(values, locale)?;
        Ok(Self {
            exact: values.iter().cloned().enumerate().map(|(i, value)| (value, i)).collect(),
            folded,
            language: supported_locale_language(locale).unwrap().to_owned(),
        })
    }

    pub fn rank(&self, value: &str, case_sensitive: bool) -> Option<usize> {
        if case_sensitive {
            self.exact.get(value).copied()
        } else {
            self.folded.get(&fold_named_value(value, &self.language)).copied()
        }
    }
}

/// None lets the caller compare two unlisted values using the existing type order.
pub(crate) fn compare_by_rank(
    a: &Value, b: &Value, list: &CustomList, case_sensitive: bool,
) -> Option<Ordering> {
    let rank = |value: &Value| match value {
        Value::Text(text) => list.rank(text, case_sensitive),
        _ => None,
    };
    match (rank(a), rank(b)) {
        (Some(a), Some(b)) => Some(a.cmp(&b)),
        (Some(_), None) => Some(Ordering::Less),
        (None, Some(_)) => Some(Ordering::Greater),
        (None, None) => None,
    }
}
