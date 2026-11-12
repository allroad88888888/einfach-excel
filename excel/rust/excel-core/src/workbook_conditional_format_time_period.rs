//! Relative dates are resolved once per display projection in the local calendar.
use super::conditional_format_highlight::{enabled_by_default, Highlight};
use crate::cell_style::CellStyle;
use crate::date_serial::{
    excel_date_parts_to_serial, excel_serial_to_date_parts, valid_date_serial,
    weekday_sunday_indexed, ExcelDateParts,
};
use chrono::{Datelike, Local};
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

pub(super) fn local_today_serial() -> Option<f64> {
    let date = Local::now().date_naive();
    excel_date_parts_to_serial(ExcelDateParts {
        year: date.year(), month: date.month(), day: date.day(), fraction: 0.0,
    })
}

fn month_start(today: f64, offset: i32) -> Option<f64> {
    let date = excel_serial_to_date_parts(today)?;
    let month = date.month as i32 - 1 + offset;
    excel_date_parts_to_serial(ExcelDateParts {
        year: date.year.checked_add(month.div_euclid(12))?,
        month: (month.rem_euclid(12) + 1) as u32,
        day: 1, fraction: 0.0,
    })
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
        let week = today - weekday_sunday_indexed(today as i64) as f64;
        Some(match self.period {
            Period::Today => (today, today + 1.0),
            Period::Yesterday => (today - 1.0, today),
            Period::Tomorrow => (today + 1.0, today + 2.0),
            Period::Last7Days => (today - 6.0, today + 1.0),
            Period::ThisWeek => (week, week + 7.0),
            Period::LastWeek => (week - 7.0, week),
            Period::NextWeek => (week + 7.0, week + 14.0),
            Period::ThisMonth => (month_start(today, 0)?, month_start(today, 1)?),
            Period::LastMonth => (month_start(today, -1)?, month_start(today, 0)?),
            Period::NextMonth => (month_start(today, 1)?, month_start(today, 2)?),
        })
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
