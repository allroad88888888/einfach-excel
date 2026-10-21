//! Advanced visual rules resolve entirely in Rust before display projection.
mod icon_set;
mod threshold;

pub use icon_set::ConditionalIconDisplay;
pub(crate) use icon_set::IconSetRule;
pub(crate) use threshold::{rewrite_rule_formulas, NumericDomain, Threshold};
