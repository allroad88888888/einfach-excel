#[derive(Clone, Debug, Default, Serialize, Deserialize)]
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
}

impl NumberFormatJSON {
    fn into_number_format(self) -> NumberFormat {
        match self.kind.as_str() {
            "number" | "decimal" => NumberFormat::Decimal {
                digits: self.digits.unwrap_or(2),
                thousands: self.thousands.unwrap_or(false),
            },
            "percent" | "percentage" => NumberFormat::Percent {
                digits: self.digits.unwrap_or(0),
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
        match nf {
            NumberFormat::Scientific { digits } => NumberFormatJSON {
                kind: "scientific".into(),
                digits: Some(*digits),
                ..Default::default()
            },
            NumberFormat::Fraction { denominator } => NumberFormatJSON {
                kind: "fraction".into(),
                denominator: Some(FractionDenominatorJSON(*denominator)),
                ..Default::default()
            },
            NumberFormat::Time(pattern) => NumberFormatJSON {
                kind: "time".into(),
                pattern: Some(pattern.clone()),
                ..Default::default()
            },
            NumberFormat::General => NumberFormatJSON {
                kind: "general".into(),
                digits: None,
                symbol: None,
                pattern: None,
                thousands: None,
                denominator: None,
            },
            NumberFormat::Decimal { digits, thousands } => NumberFormatJSON {
                kind: "number".into(),
                digits: Some(*digits),
                symbol: None,
                pattern: None,
                thousands: Some(*thousands),
                denominator: None,
            },
            NumberFormat::Percent { digits } => NumberFormatJSON {
                kind: "percent".into(),
                digits: Some(*digits),
                symbol: None,
                pattern: None,
                thousands: None,
                denominator: None,
            },
            NumberFormat::Currency { symbol, digits } => NumberFormatJSON {
                kind: "currency".into(),
                digits: Some(*digits),
                symbol: Some(symbol.clone()),
                pattern: None,
                thousands: None,
                denominator: None,
            },
            NumberFormat::Date(p) => NumberFormatJSON {
                kind: "date".into(),
                digits: None,
                symbol: None,
                pattern: Some(p.clone()),
                thousands: None,
                denominator: None,
            },
            NumberFormat::Custom(p) => NumberFormatJSON {
                kind: "custom".into(),
                digits: None,
                symbol: None,
                pattern: Some(p.clone()),
                thousands: None,
                denominator: None,
            },
        }
    }
}

/// 这些类别直接使用 Rust 显示文本，窗口投影与自动尺寸必须保持一致。
fn uses_native_number_display(format: &NumberFormat) -> bool {
    matches!(
        format,
        NumberFormat::Date(_)
            | NumberFormat::Time(_)
            | NumberFormat::Scientific { .. }
            | NumberFormat::Fraction { .. }
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
