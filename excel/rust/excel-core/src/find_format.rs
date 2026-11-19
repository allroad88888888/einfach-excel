//! Format criteria for Find by Format and sparse CellStyle patches for Replace Format.
use crate::cell_style::CellStyle;
use crate::format::{Align, CellFormat, NumberFormat};
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum FindAlign {
    Default,
    Left,
    Center,
    Right,
    CenterAcross,
}

impl From<FindAlign> for Align {
    fn from(value: FindAlign) -> Self {
        match value {
            FindAlign::Default => Align::Default,
            FindAlign::Left => Align::Left,
            FindAlign::Center => Align::Center,
            FindAlign::Right => Align::Right,
            FindAlign::CenterAcross => Align::CenterAcross,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FindNumberFormatKind {
    General,
    Text,
    Number,
    Percent,
    Currency,
    Accounting,
    Date,
    Time,
    Scientific,
    Fraction,
    Special,
    Custom,
}

impl FindNumberFormatKind {
    pub fn matches(self, format: &NumberFormat) -> bool {
        matches!(
            (self, format),
            (Self::General, NumberFormat::General)
                | (Self::Text, NumberFormat::Text)
                | (Self::Number, NumberFormat::Decimal { .. })
                | (Self::Percent, NumberFormat::Percent { .. })
                | (Self::Currency, NumberFormat::Currency { .. })
                | (Self::Accounting, NumberFormat::Accounting { .. })
                | (Self::Date, NumberFormat::Date(_))
                | (Self::Time, NumberFormat::Time(_))
                | (Self::Scientific, NumberFormat::Scientific { .. })
                | (Self::Fraction, NumberFormat::Fraction { .. })
                | (Self::Special, NumberFormat::Special(_))
                | (Self::Custom, NumberFormat::Custom(_))
        )
    }

    pub fn default_number_format(self) -> NumberFormat {
        match self {
            Self::General => NumberFormat::General,
            Self::Text => NumberFormat::Text,
            Self::Number => NumberFormat::Decimal {
                digits: 2,
                thousands: true,
            },
            Self::Percent => NumberFormat::Percent { digits: 2 },
            Self::Currency => NumberFormat::Currency {
                symbol: "$".into(),
                digits: 2,
            },
            Self::Accounting => NumberFormat::Accounting {
                symbol: "$".into(),
                digits: 2,
            },
            Self::Date => NumberFormat::Date("yyyy-mm-dd".into()),
            Self::Time => NumberFormat::Time("hh:mm:ss".into()),
            Self::Scientific => NumberFormat::Scientific { digits: 2 },
            Self::Fraction => NumberFormat::Fraction {
                denominator: crate::FractionDenominator::OneDigit,
            },
            Self::Special => NumberFormat::Special(crate::SpecialPreset::ZipCode),
            Self::Custom => NumberFormat::General,
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FindFormatFilter {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bold: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub italic: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub underline: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub strikethrough: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bg_color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_size: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_family: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub align: Option<FindAlign>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wrap_text: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub number_format: Option<FindNumberFormatKind>,
}

fn normalize_color_spec(raw: &str) -> Result<Option<String>, &'static str> {
    let trimmed = raw.trim();
    if trimmed.eq_ignore_ascii_case("none") {
        return Ok(None);
    }
    let hex = trimmed
        .strip_prefix('#')
        .filter(|s| s.len() == 6 && s.bytes().all(|b| b.is_ascii_hexdigit()))
        .ok_or("Enter a color as #RRGGBB, for example #c00000.")?;
    Ok(Some(format!("#{}", hex.to_ascii_lowercase())))
}

fn normalize_existing_color(raw: Option<&String>) -> Option<String> {
    let text = raw?.trim();
    let hex = text.strip_prefix('#')?;
    if hex.len() == 6 && hex.bytes().all(|b| b.is_ascii_hexdigit()) {
        Some(format!("#{}", hex.to_ascii_lowercase()))
    } else {
        Some(text.to_ascii_lowercase())
    }
}

impl FindFormatFilter {
    pub fn is_empty(&self) -> bool {
        self == &Self::default()
    }

    pub fn validate(&self) -> Result<(), &'static str> {
        if let Some(color) = &self.text_color {
            normalize_color_spec(color)?;
        }
        if let Some(color) = &self.bg_color {
            normalize_color_spec(color)?;
        }
        if let Some(size) = self.font_size {
            if size == 0 || size > 512 {
                return Err("Choose a font size between 1 and 512.");
            }
        }
        if let Some(family) = &self.font_family {
            if family.trim().is_empty() || family.len() > 128 {
                return Err("Choose a valid font family.");
            }
        }
        Ok(())
    }

    pub fn matches(&self, format: &CellFormat) -> bool {
        if self.bold.is_some_and(|want| format.bold != want) {
            return false;
        }
        if self.italic.is_some_and(|want| format.italic != want) {
            return false;
        }
        if self.underline.is_some_and(|want| format.underline != want) {
            return false;
        }
        if self.strikethrough.is_some_and(|want| format.strikethrough != want) {
            return false;
        }
        if self.wrap_text.is_some_and(|want| format.wrap_text != want) {
            return false;
        }
        if self.align.is_some_and(|want| format.align != Align::from(want)) {
            return false;
        }
        if self.font_size.is_some_and(|want| format.font_size != Some(want)) {
            return false;
        }
        if let Some(want) = &self.font_family {
            let matches_family = format
                .font_family
                .as_deref()
                .is_some_and(|have| have.trim().eq_ignore_ascii_case(want.trim()));
            if !matches_family {
                return false;
            }
        }
        if let Some(want) = &self.text_color {
            let Ok(target) = normalize_color_spec(want) else {
                return false;
            };
            if normalize_existing_color(format.color.as_ref()) != target {
                return false;
            }
        }
        if let Some(want) = &self.bg_color {
            let Ok(target) = normalize_color_spec(want) else {
                return false;
            };
            match target {
                None => {
                    if format.background.is_some() || format.fill.is_some() {
                        return false;
                    }
                }
                Some(hex) => {
                    if format.fill.is_some()
                        || normalize_existing_color(format.background.as_ref()).as_deref()
                            != Some(hex.as_str())
                    {
                        return false;
                    }
                }
            }
        }
        if self
            .number_format
            .is_some_and(|kind| !kind.matches(&format.number_format))
        {
            return false;
        }
        true
    }

    pub fn to_style_patch(&self) -> Result<CellStyle, &'static str> {
        self.validate()?;
        let mut patch = CellStyle::default();
        patch.bold = self.bold;
        patch.italic = self.italic;
        patch.underline = self.underline;
        patch.strikethrough = self.strikethrough;
        patch.align = self.align.map(Align::from);
        patch.wrap_text = self.wrap_text;
        if let Some(size) = self.font_size {
            patch.font_size = Some(Some(size));
        }
        if let Some(family) = &self.font_family {
            patch.font_family = Some(Some(family.trim().to_owned()));
        }
        if let Some(color) = &self.text_color {
            patch.color = Some(normalize_color_spec(color)?);
        }
        if let Some(bg) = &self.bg_color {
            patch.background = Some(normalize_color_spec(bg)?);
            patch.fill = Some(None);
        }
        if let Some(kind) = self.number_format {
            patch.number_format = Some(kind.default_number_format());
        }
        Ok(patch)
    }
}
