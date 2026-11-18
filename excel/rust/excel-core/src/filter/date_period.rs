//! Relative-date filter semantics over the native 1900 serial calendar.
use crate::advanced_filter::FilterCriteria;
use crate::calendar_period::{local_today_serial, CalendarPeriod};
use crate::date_serial::{valid_date_serial, MAX_DATE_SERIAL};
use super::{ColumnFilterRule, FilterError};

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum FilterDatePeriod {
    Today, Yesterday, Tomorrow,
    LastWeek, ThisWeek, NextWeek,
    LastMonth, ThisMonth, NextMonth,
    LastQuarter, ThisQuarter, NextQuarter,
    LastYear, ThisYear, NextYear, YearToDate,
}

impl FilterDatePeriod {
    pub(crate) fn bounds_at(self, today: f64) -> Option<(f64, f64)> {
        if today < 1.0 { return None; }
        let period = match self {
            Self::Today => CalendarPeriod::Day(0),
            Self::Yesterday => CalendarPeriod::Day(-1),
            Self::Tomorrow => CalendarPeriod::Day(1),
            Self::LastWeek => CalendarPeriod::Week(-1),
            Self::ThisWeek => CalendarPeriod::Week(0),
            Self::NextWeek => CalendarPeriod::Week(1),
            Self::LastMonth => CalendarPeriod::Month(-1),
            Self::ThisMonth => CalendarPeriod::Month(0),
            Self::NextMonth => CalendarPeriod::Month(1),
            Self::LastQuarter => CalendarPeriod::Quarter(-1),
            Self::ThisQuarter => CalendarPeriod::Quarter(0),
            Self::NextQuarter => CalendarPeriod::Quarter(1),
            Self::LastYear => CalendarPeriod::Year(-1),
            Self::ThisYear => CalendarPeriod::Year(0),
            Self::NextYear => CalendarPeriod::Year(1),
            Self::YearToDate => CalendarPeriod::YearToDate,
        };
        let (start, end) = period.bounds_at(today)?;
        Some((start.clamp(1.0, MAX_DATE_SERIAL + 1.0),
            end.clamp(1.0, MAX_DATE_SERIAL + 1.0)))
    }
}

/// Capture once before reading predicates; no clock read for non-date operations.
pub(crate) fn capture_today(criteria: FilterCriteria<'_>) -> Result<Option<f64>, FilterError> {
    if !criteria.rules().any(|rule| matches!(rule, ColumnFilterRule::DatePeriod { .. })) {
        return Ok(None);
    }
    local_today_serial().filter(|today| *today >= 1.0 && valid_date_serial(*today))
        .map(Some).ok_or(FilterError::InvalidGroups)
}

#[cfg(test)]
#[path = "date_period_tests.rs"]
mod tests;
