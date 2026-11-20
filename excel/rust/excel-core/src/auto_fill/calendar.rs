//! Calendar series planning; legacy day/week/month inference retains its contract.
use super::*;
use crate::date_serial::{
    days_in_excel_month, excel_date_parts_to_serial, excel_serial_to_date_parts, ExcelDateParts,
};
mod weekday;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum DateSeriesKind {
    Day,
    Week,
    Month,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct DateAnalysis {
    pub(super) kind: DateSeriesKind,
    pub(super) step: i64,
    pub(super) preserve_end_of_month: bool,
}

fn add_excel_months(
    anchor_serial: f64,
    month_offset: i64,
    preserve_end_of_month: bool,
) -> Option<f64> {
    let anchor = excel_serial_to_date_parts(anchor_serial)?;
    let absolute_month = (anchor.year as i64)
        .checked_mul(12)?
        .checked_add(anchor.month as i64 - 1)?
        .checked_add(month_offset)?;
    let year = absolute_month.div_euclid(12);
    if year < i32::MIN as i64 || year > i32::MAX as i64 {
        return None;
    }
    let month = absolute_month.rem_euclid(12) as u32 + 1;
    let month_days = days_in_excel_month(year as i32, month)?;
    let day = if preserve_end_of_month {
        month_days
    } else {
        anchor.day.min(month_days)
    };
    excel_date_parts_to_serial(ExcelDateParts {
        year: year as i32,
        month,
        day,
        fraction: anchor.fraction,
    })
}

fn date_value(
    anchor: f64,
    kind: DateSeriesKind,
    step: i64,
    relative: i64,
    preserve_end_of_month: bool,
) -> Option<f64> {
    match kind {
        DateSeriesKind::Month => {
            add_excel_months(anchor, step.checked_mul(relative)?, preserve_end_of_month)
        }
        DateSeriesKind::Day | DateSeriesKind::Week => {
            let multiplier = if kind == DateSeriesKind::Week { 7 } else { 1 };
            let delta = step.checked_mul(relative)?.checked_mul(multiplier)?;
            let value = anchor + delta as f64;
            value.is_finite().then_some(value)
        }
    }
}

pub(super) fn analyze_dates(values: &[f64]) -> Option<DateAnalysis> {
    if values.is_empty() || !values.iter().all(|value| value.is_finite()) {
        return None;
    }
    if values.len() == 1 {
        return Some(DateAnalysis {
            kind: DateSeriesKind::Day,
            step: 1,
            preserve_end_of_month: false,
        });
    }
    let first = excel_serial_to_date_parts(values[0])?;
    let second = excel_serial_to_date_parts(values[1])?;
    let month_step = (second.year as i64 - first.year as i64)
        .checked_mul(12)?
        .checked_add(second.month as i64 - first.month as i64)?;
    if month_step != 0 {
        let first_eom = first.day == days_in_excel_month(first.year, first.month)?;
        for preserve_end_of_month in [true, false]
            .into_iter()
            .filter(|preserve| first_eom || !*preserve)
        {
            let matches = values.iter().enumerate().all(|(index, actual)| {
                date_value(
                    values[0],
                    DateSeriesKind::Month,
                    month_step,
                    index as i64,
                    preserve_end_of_month,
                )
                .is_some_and(|expected| steps_match(*actual, expected))
            });
            if matches {
                return Some(DateAnalysis {
                    kind: DateSeriesKind::Month,
                    step: month_step,
                    preserve_end_of_month,
                });
            }
        }
    }
    let raw_step = values[1] - values[0];
    if !is_fill_integer(raw_step) || raw_step.abs() < NUMBER_EPSILON {
        return None;
    }
    let day_step = raw_step.round() as i64;
    if !values
        .iter()
        .enumerate()
        .all(|(index, value)| steps_match(*value, values[0] + day_step as f64 * index as f64))
    {
        return None;
    }
    if day_step % 7 == 0 {
        Some(DateAnalysis {
            kind: DateSeriesKind::Week,
            step: day_step / 7,
            preserve_end_of_month: false,
        })
    } else {
        Some(DateAnalysis {
            kind: DateSeriesKind::Day,
            step: day_step,
            preserve_end_of_month: false,
        })
    }
}

pub(super) fn plan_date_series(
    sheet: &crate::Sheet,
    request: &AutoFillRequest,
    write_range: Option<CellRange>,
) -> Result<Vec<PlannedCell>, AutoFillError> {
    let step = requested_step(request)?;
    if !is_safe_integer(step) {
        return Err(AutoFillError::InvalidStep(
            "calendar series step must be a non-zero safe integer",
        ));
    }
    // Excel dates are plain serial numbers: fill arithmetic runs on the
    // serial value regardless of number format, which affects display only
    // (Excel parity — a date-kind series is not gated on the source cell
    // having an effective date format). `source_numbers` already enforces
    // the value-type requirement: source cells must be canonical
    // non-formula numbers.
    if matches!(request.series, AutoFillSeries::DateWeekday | AutoFillSeries::DateYear)
        && request.source_range.cell_count() != 1
    {
        return Err(AutoFillError::InvalidSource("Select one valid numeric starting date."));
    }
    let (_source_addrs, values) = source_numbers(sheet, request, 1)?;
    if matches!(request.series, AutoFillSeries::DateWeekday | AutoFillSeries::DateYear) {
        return plan_explicit(sheet, request, write_range, step as i64, &values);
    }
    let analysis = analyze_dates(&values).ok_or(AutoFillError::InvalidSource(
        "canonical source dates do not define a calendar series",
    ))?;
    let expected_kind = match request.series {
        AutoFillSeries::DateDay => DateSeriesKind::Day,
        AutoFillSeries::DateWeek => DateSeriesKind::Week,
        AutoFillSeries::DateMonth => DateSeriesKind::Month,
        _ => unreachable!(),
    };
    if analysis.kind != expected_kind || !steps_match(analysis.step as f64, step) {
        return Err(AutoFillError::InvalidSource(
            "canonical source dates do not match the requested calendar series",
        ));
    }
    let anchor = values[0];
    plan_generated(sheet, request, write_range, |relative| {
        date_value(
            anchor,
            expected_kind,
            step as i64,
            relative,
            analysis.preserve_end_of_month,
        )
        .filter(|serial| crate::date_serial::valid_date_serial(*serial))
        .map(Value::Number)
        .ok_or(AutoFillError::InvalidSource(
            "generated series contains an invalid date",
        ))
    })
}


fn plan_explicit(
    sheet: &crate::Sheet,
    request: &AutoFillRequest,
    write_range: Option<CellRange>,
    step: i64,
    values: &[f64],
) -> Result<Vec<PlannedCell>, AutoFillError> {
    if values.len() != 1 || !crate::date_serial::valid_date_serial(values[0]) {
        return Err(AutoFillError::InvalidSource("Select one valid numeric starting date."));
    }
    if !matches!(request.direction, AutoFillDirection::Down | AutoFillDirection::Right)
        || (request.direction == AutoFillDirection::Down && request.target_range.cols() != 1)
        || (request.direction == AutoFillDirection::Right && request.target_range.rows() != 1)
    {
        return Err(AutoFillError::InvalidGeometry("Select one downward column or rightward row."));
    }
    plan_generated(sheet, request, write_range, |relative| {
        let value = step.checked_mul(relative).and_then(|offset| match request.series {
            AutoFillSeries::DateWeekday => weekday::add_workdays(values[0], offset),
            AutoFillSeries::DateYear => add_years(values[0], offset),
            _ => unreachable!(),
        });
        value.filter(|serial| crate::date_serial::valid_date_serial(*serial))
            .map(Value::Number).ok_or(AutoFillError::InvalidSource(
                "generated series contains an invalid date",
            ))
    })
}

fn add_years(anchor: f64, offset: i64) -> Option<f64> {
    let mut date = excel_serial_to_date_parts(anchor)?;
    date.year = i32::try_from((date.year as i64).checked_add(offset)?).ok()?;
    if date.day == 0 {
        // Serial 0 displays as January 0: normalize the target January 0.
        date.year = date.year.checked_sub(1)?;
        date.month = 12;
        date.day = 31;
    } else {
        date.day = date.day.min(days_in_excel_month(date.year, date.month)?);
    }
    excel_date_parts_to_serial(date)
}

#[cfg(test)]
mod tests;

#[cfg(test)]
mod target_tests;
