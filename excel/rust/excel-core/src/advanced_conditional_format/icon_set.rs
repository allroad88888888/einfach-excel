//! Three-band icons carry resolved rendering metadata; no condition escapes to the UI.
use super::{NumericDomain, Threshold};
use crate::workbook::{conditional_format_highlight::enabled_by_default, Workbook};
use crate::CellAddress;
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Deserialize, Serialize, Debug, PartialEq)]
pub enum IconSet {
    #[serde(rename = "three-arrows")]
    Arrows,
    #[serde(rename = "three-traffic-lights")]
    TrafficLights,
    #[serde(rename = "three-flags")]
    Flags,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct IconSetJson {
    kind: String,
    #[serde(default = "enabled_by_default")]
    enabled: bool,
    icon_set: IconSet,
    lower_threshold: Option<Threshold>,
    upper_threshold: Option<Threshold>,
    #[serde(default)]
    reverse: bool,
    #[serde(default = "enabled_by_default")]
    show_value: bool,
}

pub(crate) struct IconSetRule {
    pub(crate) enabled: bool,
    set: IconSet,
    lower: Threshold,
    upper: Threshold,
    reverse: bool,
    show_value: bool,
    resolved: Option<(f64, f64)>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConditionalIconDisplay {
    pub set: IconSet,
    pub index: u8,
    pub show_value: bool,
}

impl IconSetRule {
    pub(crate) fn parse(json: &str) -> Result<Self, &'static str> {
        let rule: IconSetJson = serde_json::from_str(json)
            .map_err(|_| "Choose a valid three-icon set and thresholds.")?;
        if rule.kind != "icon-set" { return Err("Expected an icon-set rule."); }
        let lower = rule.lower_threshold.unwrap_or(Threshold::Percent { value: "33".into() });
        let upper = rule.upper_threshold.unwrap_or(Threshold::Percent { value: "67".into() });
        lower.validate()?; upper.validate()?;
        Ok(Self { enabled: rule.enabled, set: rule.icon_set, lower, upper,
            reverse: rule.reverse, show_value: rule.show_value, resolved: None })
    }

    pub(crate) fn resolve(&mut self, domain: &NumericDomain, book: &Workbook, sheet: usize, origin: CellAddress) -> bool {
        self.resolved = self.lower.resolve(domain, book, sheet, origin).zip(self.upper.resolve(domain, book, sheet, origin))
            .filter(|(lower, upper)| lower <= upper);
        self.resolved.is_some()
    }

    pub(crate) fn display(&self, value: f64) -> ConditionalIconDisplay {
        let (lower, upper) = self.resolved.expect("resolved before projection");
        let band = if value >= upper { 2 } else if value >= lower { 1 } else { 0 };
        ConditionalIconDisplay { set: self.set, index: if self.reverse { 2 - band } else { band },
            show_value: self.show_value }
    }
}
