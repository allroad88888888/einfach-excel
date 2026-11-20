//! The 11 native Excel consolidation functions for static evaluation and linked formulas.
use einfach_core::{Value, ValueError};
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ConsolidateFunction {
    Sum,
    Count,
    Average,
    Max,
    Min,
    Product,
    CountNumbers,
    SampleStandardDeviation,
    PopulationStandardDeviation,
    SampleVariance,
    PopulationVariance,
}

impl ConsolidateFunction {
    /// Native Excel formula name emitted on summary rows when `create_links` is true.
    pub(crate) const fn formula_name(self) -> &'static str {
        match self {
            Self::Sum => "SUM",
            Self::Count => "COUNTA",
            Self::Average => "AVERAGE",
            Self::Max => "MAX",
            Self::Min => "MIN",
            Self::Product => "PRODUCT",
            Self::CountNumbers => "COUNT",
            Self::SampleStandardDeviation => "STDEV.S",
            Self::PopulationStandardDeviation => "STDEV.P",
            Self::SampleVariance => "VAR.S",
            Self::PopulationVariance => "VAR.P",
        }
    }

    /// Evaluate one bucket of source values using Excel consolidation semantics.
    pub(crate) fn evaluate(self, values: &[Value]) -> Value {
        if values.is_empty() {
            return Value::Null;
        }
        if matches!(self, Self::Count) {
            let count = values
                .iter()
                .filter(|v| !matches!(v, Value::Null))
                .count();
            return if count == 0 {
                Value::Null
            } else {
                Value::Number(count as f64)
            };
        }
        let numbers: Vec<f64> = values
            .iter()
            .filter_map(|v| match v {
                Value::Number(n) if n.is_finite() => Some(*n),
                _ => None,
            })
            .collect();
        if matches!(self, Self::CountNumbers) {
            let any_non_null = values.iter().any(|v| !matches!(v, Value::Null));
            return if !any_non_null {
                Value::Null
            } else {
                Value::Number(numbers.len() as f64)
            };
        }
        if let Some(err) = values.iter().find_map(|v| match v {
            Value::Error(e) => Some(e.clone()),
            _ => None,
        }) {
            return Value::Error(err);
        }
        if numbers.is_empty() {
            let any_non_null = values.iter().any(|v| !matches!(v, Value::Null));
            if !any_non_null {
                return Value::Null;
            }
            return match self {
                Self::Sum | Self::Max | Self::Min | Self::Product => Value::Number(0.0),
                Self::Average
                | Self::SampleStandardDeviation
                | Self::PopulationStandardDeviation
                | Self::SampleVariance
                | Self::PopulationVariance => Value::Error(ValueError::DivisionByZero),
                Self::Count | Self::CountNumbers => unreachable!(),
            };
        }
        let result = match self {
            Self::Sum => numbers.iter().copied().sum::<f64>(),
            Self::Average => numbers.iter().copied().sum::<f64>() / numbers.len() as f64,
            Self::Max => numbers
                .iter()
                .copied()
                .fold(f64::NEG_INFINITY, f64::max),
            Self::Min => numbers.iter().copied().fold(f64::INFINITY, f64::min),
            Self::Product => numbers.iter().copied().product::<f64>(),
            Self::SampleVariance | Self::SampleStandardDeviation => {
                if numbers.len() < 2 {
                    return Value::Error(ValueError::DivisionByZero);
                }
                let mean = numbers.iter().copied().sum::<f64>() / numbers.len() as f64;
                let ss = numbers.iter().map(|x| (x - mean).powi(2)).sum::<f64>();
                let variance = ss / (numbers.len() - 1) as f64;
                if matches!(self, Self::SampleStandardDeviation) {
                    variance.sqrt()
                } else {
                    variance
                }
            }
            Self::PopulationVariance | Self::PopulationStandardDeviation => {
                let mean = numbers.iter().copied().sum::<f64>() / numbers.len() as f64;
                let ss = numbers.iter().map(|x| (x - mean).powi(2)).sum::<f64>();
                let variance = ss / numbers.len() as f64;
                if matches!(self, Self::PopulationStandardDeviation) {
                    variance.sqrt()
                } else {
                    variance
                }
            }
            Self::Count | Self::CountNumbers => unreachable!(),
        };
        if result.is_finite() {
            Value::Number(result)
        } else {
            Value::Error(ValueError::Overflow)
        }
    }
}
