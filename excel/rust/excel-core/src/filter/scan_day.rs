//! Lazily sample the local calendar once per filter operation.

use std::cell::OnceCell;

use crate::advanced_filter::FilterCriteria;
use crate::date_serial::valid_date_serial;
use crate::filter::{ColumnFilterRule, FilterError};

#[derive(Default)]
pub(crate) struct FilterScanDay(OnceCell<Option<f64>>);

impl FilterScanDay {
    pub(crate) fn today(&self) -> Option<f64> {
        *self.0.get_or_init(crate::calendar_period::local_today_serial)
    }

    pub(crate) fn for_criteria(&self, criteria: FilterCriteria<'_>) -> Result<Option<f64>, FilterError> {
        if criteria.rules().any(|rule| matches!(rule, ColumnFilterRule::DatePeriod { .. })) {
            return self.today().filter(|today| *today >= 1.0 && valid_date_serial(*today))
                .map(Some).ok_or(FilterError::InvalidGroups);
        }
        if criteria.rules().any(|rule| matches!(rule, ColumnFilterRule::Color { .. })) {
            return Ok(self.today());
        }
        Ok(None)
    }
}
