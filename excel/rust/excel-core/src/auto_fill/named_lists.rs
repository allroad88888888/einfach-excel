//! Request-local, bounded named-list catalog. Validation and indexing happen once,
//! before matrix lane planning; clones share both canonical labels and lookup maps.
use super::*;
use std::collections::HashMap;
use std::sync::Arc;

#[derive(Clone, Debug, PartialEq)]
pub struct AutoFillNamedList {
    pub series: AutoFillSeries,
    pub witness: AutoFillListWitness,
}

#[derive(Debug, PartialEq)]
pub(super) struct PreparedNamedList {
    pub series: AutoFillSeries,
    pub witness: Arc<AutoFillListWitness>,
    pub indices: HashMap<String, usize>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct AutoFillNamedLists(Arc<[PreparedNamedList]>);

impl AutoFillNamedLists {
    /// No external candidates; built-ins retain automatic inference precedence.
    pub fn empty() -> Self {
        Self::new(Vec::new()).expect("canonical built-in named lists")
    }

    pub fn new(lists: Vec<AutoFillNamedList>) -> Result<Self, AutoFillError> {
        if lists.len() > 66 {
            return Err(AutoFillError::InvalidWitness(
                "at most 66 named-list candidates",
            ));
        }
        let mut total = 0;
        let mut names = std::collections::HashSet::new();
        let mut counts = [0; 4];
        let locale = lists.first().map(|list| list.witness.locale.as_str());
        for list in &lists {
            if Some(list.witness.locale.as_str()) != locale {
                return Err(AutoFillError::InvalidWitness(
                    "candidate locales must agree",
                ));
            }
            total += list.witness.list_name.encode_utf16().count()
                + list.witness.locale.encode_utf16().count()
                + list
                    .witness
                    .values
                    .iter()
                    .map(|value| value.encode_utf16().count())
                    .sum::<usize>();
            if total > 1_100_000 {
                return Err(AutoFillError::InvalidWitness(
                    "named-list metadata exceeds 1100000 UTF-16 units",
                ));
            }
            if list.series == AutoFillSeries::CustomList {
                let display = list
                    .witness
                    .list_name
                    .strip_prefix("host:")
                    .or_else(|| list.witness.list_name.strip_prefix("user:"))
                    .ok_or(AutoFillError::InvalidWitness(
                        "candidate requires a host: or user: namespace",
                    ))?;
                let source = usize::from(list.witness.list_name.starts_with("user:"));
                counts[source] += 1;
                let language = supported_locale_language(&list.witness.locale).ok_or(
                    AutoFillError::InvalidWitness(
                        "named series locale must be supported and canonical",
                    ),
                )?;
                if counts[source] > 32
                    || !names.insert((source, fold_named_value(display.trim(), language)))
                {
                    return Err(AutoFillError::InvalidWitness(
                        "each source allows 32 distinct list names",
                    ));
                }
                let lower = display.to_ascii_lowercase();
                if display.trim().is_empty()
                    || display.encode_utf16().count() > 64
                    || lower.starts_with("builtin-")
                    || lower.starts_with("locale-")
                {
                    return Err(AutoFillError::InvalidWitness(
                        "invalid named-list candidate name",
                    ));
                }
            } else {
                let slot = match list.series {
                    AutoFillSeries::WeekdayName => 2,
                    AutoFillSeries::MonthName => 3,
                    _ => {
                        return Err(AutoFillError::InvalidWitness(
                            "invalid named-list candidate kind",
                        ))
                    }
                };
                counts[slot] += 1;
                if counts[slot] > 1 {
                    return Err(AutoFillError::InvalidWitness(
                        "one optional weekday and month candidate",
                    ));
                }
            }
        }
        let mut prepared = Vec::with_capacity(lists.len() + 8);
        for list in builtin_candidates().into_iter().chain(lists) {
            let indices = named_series::normalize_witness(list.series, &list.witness)?;
            prepared.push(PreparedNamedList {
                series: list.series,
                witness: Arc::new(list.witness),
                indices,
            });
        }
        Ok(Self(prepared.into()))
    }

    pub(super) fn entries(&self) -> &[PreparedNamedList] {
        &self.0
    }
}

fn labels(series: AutoFillSeries, name: &str, locale: &str, values: &[&str]) -> AutoFillNamedList {
    AutoFillNamedList {
        series,
        witness: AutoFillListWitness {
            list_name: name.into(),
            locale: locale.into(),
            values: values.iter().map(|value| (*value).into()).collect(),
        },
    }
}

fn builtin_candidates() -> Vec<AutoFillNamedList> {
    use AutoFillSeries::{MonthName as M, WeekdayName as W};
    vec![
        labels(W, "builtin-weekday-short", "en", &BUILTIN_WEEKDAY_SHORT),
        labels(W, "builtin-weekday-long", "en", &BUILTIN_WEEKDAY_LONG),
        labels(
            W,
            "locale-weekday",
            "zh",
            &[
                "星期一",
                "星期二",
                "星期三",
                "星期四",
                "星期五",
                "星期六",
                "星期日",
            ],
        ),
        labels(
            W,
            "locale-weekday",
            "zh",
            &["周一", "周二", "周三", "周四", "周五", "周六", "周日"],
        ),
        labels(M, "builtin-month-short", "en", &BUILTIN_MONTH_SHORT),
        labels(M, "builtin-month-long", "en", &BUILTIN_MONTH_LONG),
        labels(
            M,
            "locale-month",
            "zh",
            &[
                "1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月",
                "12月",
            ],
        ),
        labels(
            M,
            "locale-month",
            "zh",
            &[
                "一月",
                "二月",
                "三月",
                "四月",
                "五月",
                "六月",
                "七月",
                "八月",
                "九月",
                "十月",
                "十一月",
                "十二月",
            ],
        ),
    ]
}
