// Deserialize the complete number-format input before resolving Special's paired fields.
// All mutation/import/preview paths share this boundary; invalid pairs never reach the workbook.
#[derive(Deserialize)]
struct NumberFormatInput {
    #[serde(deserialize_with = "deserialize_number_format_kind")]
    kind: String,
    #[serde(default)]
    denominator: Option<FractionDenominatorJSON>,
    #[serde(default)]
    digits: Option<u8>,
    #[serde(default)]
    symbol: Option<String>,
    #[serde(default)]
    pattern: Option<String>,
    #[serde(default)]
    thousands: Option<bool>,
    #[serde(default)]
    preset: Option<String>,
    #[serde(default)]
    locale: Option<String>,
}

impl TryFrom<NumberFormatInput> for NumberFormatJSON {
    type Error = &'static str;

    fn try_from(mut input: NumberFormatInput) -> Result<Self, Self::Error> {
        if input.kind == "special" {
            let preset = einfach_excel_core::SpecialPreset::parse(
                input.preset.as_deref().ok_or("special number format requires a preset")?,
                input.locale.as_deref(),
            )?;
            input.locale = Some(preset.locale().into());
        } else if input.preset.is_some() || input.locale.is_some() {
            return Err("preset and locale are only supported for special number formats");
        }
        Ok(Self {
            kind: input.kind, denominator: input.denominator, digits: input.digits,
            symbol: input.symbol, pattern: input.pattern, thousands: input.thousands,
            preset: input.preset, locale: input.locale,
        })
    }
}
