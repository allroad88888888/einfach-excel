//! Rule-wide thresholds use the complete sparse numeric domain, never the viewport.
use crate::workbook::{Workbook, WorkbookEvalProvider};
use crate::{parse_formula, CellAddress};
use crate::eval::eval_expr_with_provider;
use einfach_core::Value;
use serde::Deserialize;
use std::cell::Cell;

#[derive(Clone, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase", deny_unknown_fields)]
pub(crate) enum Threshold {
    Min,
    Max,
    Number { value: String },
    Percent { value: String },
    Percentile { value: String },
    Formula { value: String },
}

pub(crate) struct NumericDomain {
    values: Vec<f64>,
}

impl NumericDomain {
    pub(crate) fn from_value(value: &Value) -> Option<Self> {
        let Value::Array(array) = value else { return None };
        let values: Vec<f64> = (0..array.cols).filter_map(|column| match array.get(0, column) {
            Some(Value::Number(value)) if value.is_finite() => Some(*value),
            _ => None,
        }).collect();
        (!values.is_empty()).then_some(Self { values })
    }

    pub(crate) fn min(&self) -> f64 { self.values[0] }
    pub(crate) fn max(&self) -> f64 { self.values[self.values.len() - 1] }

    fn percentile(&self, percent: f64) -> f64 {
        // Inclusive percentile: (n - 1) * p, linearly interpolated between members.
        let index = (self.values.len() - 1) as f64 * percent / 100.0;
        let lower = index.floor() as usize;
        let upper = index.ceil() as usize;
        interpolate(self.values[lower], self.values[upper], index.fract())
    }
}

impl Threshold {
    pub(crate) fn validate(&self) -> Result<(), &'static str> {
        match self {
            Self::Number { value } => { number(value)?; }
            Self::Percent { value } | Self::Percentile { value } => {
                if !(0.0..=100.0).contains(&number(value)?) {
                    return Err("Threshold percentages must be between 0 and 100.");
                }
            }
            Self::Formula { value } => {
                parse_formula(value.trim()).ok_or("Enter a valid threshold formula.")?;
            }
            Self::Min | Self::Max => {}
        }
        Ok(())
    }

    pub(crate) fn resolve(
        &self, domain: &NumericDomain, book: &Workbook, sheet: usize, origin: CellAddress,
    ) -> Option<f64> {
        match self {
            Self::Min => Some(domain.min()),
            Self::Max => Some(domain.max()),
            Self::Number { value } => number(value).ok(),
            Self::Percent { value } => Some(interpolate(domain.min(), domain.max(), number(value).ok()? / 100.0)),
            Self::Percentile { value } => Some(domain.percentile(number(value).ok()?)),
            Self::Formula { value } => {
                let expression = parse_formula(value.trim())?;
                let provider = WorkbookEvalProvider {
                    wb: book, current: Cell::new(sheet), current_cell: Cell::new(Some(origin)),
                };
                let value = eval_expr_with_provider(&expression, &provider);
                let scalar = match &value {
                    Value::Array(array) => array.get(0, 0),
                    _ => Some(&value),
                };
                match scalar {
                    Some(Value::Number(number)) if number.is_finite() => Some(*number),
                    _ => None,
                }
            }
        }
    }
}

fn number(text: &str) -> Result<f64, &'static str> {
    text.trim().parse::<f64>().ok().filter(|value| value.is_finite())
        .ok_or("Enter a finite threshold number.")
}

fn interpolate(low: f64, high: f64, position: f64) -> f64 {
    if position <= 0.0 { return low; }
    if position >= 1.0 { return high; }
    if low == high { return low; }
    let span = high - low;
    if span.is_finite() { low + span * position }
    else { low * (1.0 - position) + high * position }
}

/// Structural edits and sheet rename share one visitor for all formula-bearing fields.
pub(crate) fn rewrite_rule_formulas(
    json: &mut serde_json::Value, mut rewrite: impl FnMut(&str) -> Option<String>,
) -> bool {
    let mut changed = false;
    if json["kind"] == "formula" {
        if let Some(text) = json["formula"].as_str().and_then(&mut rewrite) {
            json["formula"] = text.into(); changed = true;
        }
    }
    for field in ["minThreshold", "midThreshold", "maxThreshold", "lowerThreshold", "upperThreshold"] {
        if json[field]["type"] == "formula" {
            if let Some(text) = json[field]["value"].as_str().and_then(&mut rewrite) {
                json[field]["value"] = text.into(); changed = true;
            }
        }
    }
    changed
}
