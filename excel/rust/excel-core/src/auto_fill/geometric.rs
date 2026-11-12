//! Plan a bounded explicit multiplication sequence before any native writes.
use super::*;

pub(super) fn plan(
    sheet: &crate::Sheet,
    request: &AutoFillRequest,
    destination: Option<CellRange>,
    stop: Option<f64>,
) -> Result<(Vec<PlannedCell>, Option<CellRange>), AutoFillError> {
    if !matches!(request.direction, AutoFillDirection::Down | AutoFillDirection::Right)
        || request.source_range.cell_count() != 1
        || (request.direction == AutoFillDirection::Down && request.target_range.cols() != 1)
        || (request.direction == AutoFillDirection::Right && request.target_range.rows() != 1)
    {
        return Err(AutoFillError::InvalidGeometry(
            "geometric series require one starting cell and a downward column or rightward row",
        ));
    }
    let ratio = request.step.filter(|value| value.is_finite()).ok_or(
        AutoFillError::InvalidStep("geometric step must be finite"),
    )?;
    let (_, values) = source_numbers(sheet, request, 1)?;
    let start = values[0];
    if let Some(stop) = stop {
        if !stop.is_finite() {
            return Err(AutoFillError::InvalidStep("stop must be finite"));
        }
        if ratio <= 0.0 || ratio == 1.0 || start == 0.0 {
            return Err(AutoFillError::InvalidStep(
                "Stop requires a non-zero start and a positive step other than 1.",
            ));
        }
    }
    // Compare signs without multiplying: determining the trend must not overflow.
    let increasing = (start > 0.0) == (ratio > 1.0);
    if stop.is_some_and(|end| start_reached(start, end, increasing)) {
        return Ok((Vec::new(), None));
    }
    let Some(destination) = destination else { return Ok((Vec::new(), None)); };
    let mut cells = Vec::new();
    let mut value = start;
    for addr in destination.iter() {
        let previous = value;
        value *= ratio;
        let at_end = stop.is_some_and(|end| at_stop(previous, value, ratio, end));
        // Stop truncation precedes finite-result and destination preflight checks.
        // An infinite next term is necessarily beyond a finite monotonic Stop.
        if stop.is_some_and(|end| !at_end &&
            if increasing { value > end } else { value < end }) { break; }
        if !value.is_finite() {
            return Err(AutoFillError::InvalidSource(
                "generated series contains a non-finite value",
            ));
        }
        if sheet.is_spill_region(addr) { return Err(AutoFillError::SpillTarget(addr)); }
        if sheet.merged_ranges().iter().any(|range| range.contains(addr)) {
            return Err(AutoFillError::InvalidGeometry("unmerge cells before filling this range"));
        }
        cells.push(PlannedCell {
            addr,
            value: PlannedValue::Primitive(Value::Number(value)),
            format: sheet.effective_format(&request.source_range.start.to_string_repr()),
            rich_text: Vec::new(),
        });
        if at_end { break; }
    }
    let range = cells.first().zip(cells.last()).map(|(first, last)| CellRange::new(first.addr, last.addr));
    Ok((cells, range))
}

fn start_reached(value: f64, end: f64, increasing: bool) -> bool {
    if increasing { value >= end } else { value <= end }
}

/// Only computed terms receive a small rounding allowance, never the native start.
/// ULP distance scales down to subnormals without an absolute epsilon floor. The
/// half-step cap keeps distinct near-unit terms from becoming the same endpoint.
fn at_stop(previous: f64, value: f64, ratio: f64, end: f64) -> bool {
    if value == end { return true; }
    if !value.is_finite() || !end.is_finite()
        || value.is_sign_negative() != end.is_sign_negative()
        || value.to_bits().abs_diff(end.to_bits()) > 4
    {
        return false;
    }
    let actual_step = (value - previous).abs();
    let next_step = value.abs() * (ratio - 1.0).abs();
    // A zero/underflowed step disables approximate equality; exact equality above
    // still handles an inclusive zero Stop. An overflowing next step is harmless.
    (value - end).abs() < actual_step.min(next_step) * 0.5
}

#[cfg(test)]
mod tests;

#[cfg(test)]
mod target_tests;

#[cfg(test)]
mod stop_tests;
