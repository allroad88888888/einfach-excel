#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(try_from = "NumberFormatInput")]
struct NumberFormatJSON {
    /// 原生数字格式类别；别名在 into_number_format 统一。
    kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    denominator: Option<FractionDenominatorJSON>,
    #[serde(default)]
    digits: Option<u8>,
    /// Currency symbol — used when `kind == "currency"`.
    #[serde(default)]
    symbol: Option<String>,
    /// Pattern — used when `kind == "date"` or `kind == "custom"`.
    #[serde(default)]
    pattern: Option<String>,
    /// Render thousands separators for `decimal`.
    #[serde(default)]
    thousands: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    preset: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    locale: Option<String>,
}

impl NumberFormatJSON {
    fn into_number_format(self) -> NumberFormat {
        match self.kind.as_str() {
            "special" => NumberFormat::Special(einfach_excel_core::SpecialPreset::parse(
                self.preset.as_deref().expect("validated special preset"), self.locale.as_deref(),
            ).expect("validated special format")),
            "text" => NumberFormat::Text,
            "number" | "decimal" => NumberFormat::Decimal {
                digits: self.digits.unwrap_or(2),
                thousands: self.thousands.unwrap_or(false),
            },
            "percent" | "percentage" => NumberFormat::Percent {
                digits: self.digits.unwrap_or(0),
            },
            "accounting" => NumberFormat::Accounting {
                symbol: self.symbol.unwrap_or_else(|| "$".into()),
                digits: self.digits.unwrap_or(2).min(15),
            },
            "currency" => NumberFormat::Currency {
                symbol: self.symbol.unwrap_or_else(|| "$".into()),
                digits: self.digits.unwrap_or(2),
            },
            "scientific" => NumberFormat::Scientific {
                digits: self.digits.unwrap_or(2).min(15),
            },
            "fraction" => NumberFormat::Fraction {
                denominator: self.denominator.map(|value| value.0).unwrap_or_default(),
            },
            "time" => NumberFormat::Time(self.pattern.unwrap_or_else(|| "hh:mm:ss".into())),
            "date" => NumberFormat::Date(self.pattern.unwrap_or_else(|| "yyyy-mm-dd".into())),
            "custom" => self
                .pattern
                .map(NumberFormat::Custom)
                .unwrap_or(NumberFormat::General),
            _ => NumberFormat::General,
        }
    }

    fn from_number_format(nf: &NumberFormat) -> Self {
        let mut wire = Self::default();
        wire.kind = match nf {
            NumberFormat::General => "general",
            NumberFormat::Text => "text",
            NumberFormat::Decimal { digits, thousands } => {
                wire.digits = Some(*digits); wire.thousands = Some(*thousands); "number"
            }
            NumberFormat::Percent { digits } => { wire.digits = Some(*digits); "percent" }
            NumberFormat::Currency { symbol, digits } | NumberFormat::Accounting { symbol, digits } => {
                wire.digits = Some(*digits); wire.symbol = Some(symbol.clone());
                if matches!(nf, NumberFormat::Accounting { .. }) { "accounting" } else { "currency" }
            }
            NumberFormat::Scientific { digits } => { wire.digits = Some(*digits); "scientific" }
            NumberFormat::Fraction { denominator } => {
                wire.denominator = Some(FractionDenominatorJSON(*denominator)); "fraction"
            }
            NumberFormat::Date(pattern) | NumberFormat::Time(pattern) | NumberFormat::Custom(pattern) => {
                wire.pattern = Some(pattern.clone());
                match nf { NumberFormat::Date(_) => "date", NumberFormat::Time(_) => "time", _ => "custom" }
            }
            NumberFormat::Special(preset) => {
                wire.preset = Some(preset.id().into()); wire.locale = Some(preset.locale().into()); "special"
            }
        }.into();
        wire
    }
}

/// 这些类别直接使用 Rust 显示文本，窗口投影与自动尺寸必须保持一致。
fn uses_native_number_display(format: &NumberFormat) -> bool {
    matches!(
        format,
        NumberFormat::Text
            | NumberFormat::Decimal { .. }
            | NumberFormat::Percent { .. }
            | NumberFormat::Currency { .. }
            | NumberFormat::Accounting { .. }
            | NumberFormat::Date(_)
            | NumberFormat::Time(_)
            | NumberFormat::Scientific { .. }
            | NumberFormat::Fraction { .. }
            | NumberFormat::Custom(_)
            | NumberFormat::Special(_)
    )
}

// 分母 wire 同时接受具名精度与固定正整数，在写入前拒绝无效分母。
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(
    try_from = "FractionDenominatorInput",
    into = "FractionDenominatorInput"
)]
struct FractionDenominatorJSON(einfach_excel_core::FractionDenominator);

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
enum FractionDenominatorInput {
    Named(String),
    Fixed(u32),
}

impl TryFrom<FractionDenominatorInput> for FractionDenominatorJSON {
    type Error = String;
    fn try_from(value: FractionDenominatorInput) -> Result<Self, Self::Error> {
        use einfach_excel_core::FractionDenominator::*;
        match value {
            FractionDenominatorInput::Fixed(n) if n > 0 => Ok(Self(Fixed(n))),
            FractionDenominatorInput::Named(name) => match name.as_str() {
                "one-digit" => Ok(Self(OneDigit)),
                "two-digit" => Ok(Self(TwoDigit)),
                "three-digit" => Ok(Self(ThreeDigit)),
                _ => Err("invalid fraction precision".into()),
            },
            _ => Err("fraction denominator must be a positive integer".into()),
        }
    }
}

impl From<FractionDenominatorJSON> for FractionDenominatorInput {
    fn from(value: FractionDenominatorJSON) -> Self {
        use einfach_excel_core::FractionDenominator::*;
        match value.0 {
            OneDigit => Self::Named("one-digit".into()),
            TwoDigit => Self::Named("two-digit".into()),
            ThreeDigit => Self::Named("three-digit".into()),
            Fixed(n) => Self::Fixed(n),
        }
    }
}

fn deserialize_number_format_kind<'de, D: serde::Deserializer<'de>>(deserializer: D) -> Result<String, D::Error> {
    let kind = String::deserialize(deserializer)?;
    if matches!(kind.as_str(), "general" | "text" | "number" | "decimal" | "percent" | "percentage"
        | "currency" | "accounting" | "scientific" | "fraction" | "time" | "date" | "custom" | "special") {
        Ok(kind)
    } else {
        Err(serde::de::Error::custom("unsupported number format category"))
    }
}
