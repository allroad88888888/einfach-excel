//! Relative dates are resolved once per display projection in the local calendar.
use super::conditional_format_highlight::{enabled_by_default, Highlight};
use crate::cell_style::CellStyle;
use crate::date_serial::valid_date_serial;
use crate::calendar_period::CalendarPeriod;
pub(super) use crate::calendar_period::local_today_serial;
use serde::Deserialize;

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
enum Period {
    Today,
    Yesterday,
    Tomorrow,
    Last7Days,
    ThisWeek,
    LastWeek,
    NextWeek,
    ThisMonth,
    LastMonth,
    NextMonth,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct TimePeriodJson {
    kind: String,
    period: Period,
    #[serde(default = "enabled_by_default")]
    enabled: bool,
    format: Highlight,
}

pub(crate) struct TimePeriodRule {
    period: Period,
    bounds: Option<(f64, f64)>,
    pub(super) enabled: bool,
    pub(super) style: CellStyle,
}

impl TimePeriodRule {
    pub(super) fn parse(json: &str) -> Result<Self, &'static str> {
        let rule: TimePeriodJson = serde_json::from_str(json)
            .map_err(|_| "Choose a supported date period and highlight.")?;
        if rule.kind != "time-period" {
            return Err("Choose a supported date period and highlight.");
        }
        Ok(Self {
            period: rule.period, bounds: None,
            enabled: rule.enabled, style: rule.format.into_style()?,
        })
    }

    pub(super) fn resolve(&mut self, today: Option<f64>) -> bool {
        self.bounds = today.filter(|today| valid_date_serial(*today))
            .and_then(|today| self.bounds_at(today.floor()));
        self.bounds.is_some()
    }

    fn bounds_at(&self, today: f64) -> Option<(f64, f64)> {
        let period = match self.period {
            Period::Today => CalendarPeriod::Day(0),
            Period::Yesterday => CalendarPeriod::Day(-1),
            Period::Tomorrow => CalendarPeriod::Day(1),
            Period::Last7Days => CalendarPeriod::Last7Days,
            Period::ThisWeek => CalendarPeriod::Week(0),
            Period::LastWeek => CalendarPeriod::Week(-1),
            Period::NextWeek => CalendarPeriod::Week(1),
            Period::ThisMonth => CalendarPeriod::Month(0),
            Period::LastMonth => CalendarPeriod::Month(-1),
            Period::NextMonth => CalendarPeriod::Month(1),
        };
        period.bounds_at(today)
    }

    pub(super) fn matches(&self, number: f64) -> bool {
        valid_date_serial(number) && self.bounds.is_some_and(|(start, end)| {
            let day = number.floor();
            day >= start && day < end
        })
    }
}

#[cfg(test)]
#[path = "workbook_conditional_format_time_period_tests.rs"]
mod tests;
