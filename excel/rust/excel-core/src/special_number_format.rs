//! Named identification-number displays; values and input parsing stay unchanged.
use crate::custom_number_format::{format_number, CustomFormatted};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SpecialPreset { ZipCode, ZipPlus4, PhoneUs, SsnUs, PostalCodeCn }

impl SpecialPreset {
    pub fn parse(preset: &str, locale: Option<&str>) -> Result<Self, &'static str> {
        if locale.is_some_and(|value| !matches!(value, "en-US" | "zh-CN")) {
            return Err("unsupported special number format locale");
        }
        let value = match preset {
            "zip-code" => Self::ZipCode,
            "zip-plus-4" => Self::ZipPlus4,
            "phone-us" => Self::PhoneUs,
            "ssn-us" => Self::SsnUs,
            "postal-code-cn" => Self::PostalCodeCn,
            _ => return Err("unsupported special number format preset"),
        };
        if locale.is_some_and(|locale| locale != value.locale()) {
            return Err("special number format preset and locale do not match");
        }
        Ok(value)
    }

    pub fn id(self) -> &'static str {
        match self {
            Self::ZipCode => "zip-code", Self::ZipPlus4 => "zip-plus-4",
            Self::PhoneUs => "phone-us", Self::SsnUs => "ssn-us", Self::PostalCodeCn => "postal-code-cn",
        }
    }

    pub fn locale(self) -> &'static str {
        if self == Self::PostalCodeCn { "zh-CN" } else { "en-US" }
    }

    pub fn code(self) -> &'static str {
        match self {
            Self::ZipCode => "00000",
            Self::ZipPlus4 => r"00000\-0000",
            Self::PhoneUs => r"[<=9999999]###\-####;\(###\)\ ###\-####",
            Self::SsnUs => r"000\-00\-0000",
            Self::PostalCodeCn => "000000",
        }
    }

    pub fn display(self, value: f64) -> Option<CustomFormatted> { format_number(self.code(), value) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn presets_format_numbers_without_truncation_or_content_validation() {
        for (preset, value, expected) in [
            (SpecialPreset::ZipCode, 123.0, "00123"),
            (SpecialPreset::ZipCode, -123.5, "-00124"),
            (SpecialPreset::ZipPlus4, 1234567.0, "00123-4567"),
            (SpecialPreset::SsnUs, 12345678.0, "012-34-5678"),
            (SpecialPreset::PostalCodeCn, 123.0, "000123"),
            (SpecialPreset::ZipPlus4, 1234567890123.0, "123456789-0123"),
            (SpecialPreset::PhoneUs, 5551234.0, "555-1234"),
            (SpecialPreset::PhoneUs, 2125551234.0, "(212) 555-1234"),
            (SpecialPreset::PhoneUs, -2125551234.0, "-212555-1234"),
            (SpecialPreset::PhoneUs, 5551234.5, "555-1235"),
            (SpecialPreset::PhoneUs, 1234567890123.0, "(123456) 789-0123"),
            (SpecialPreset::PhoneUs, 0.0, "-"),
        ] {
            assert_eq!(preset.display(value).unwrap().text, expected);
        }
    }

    #[test]
    fn missing_locale_infers_the_preset_and_invalid_pairs_reject() {
        assert_eq!(SpecialPreset::parse("postal-code-cn", None).unwrap().locale(), "zh-CN");
        for (preset, locale) in [("unknown", None), ("zip-code", Some("zh-CN")),
            ("postal-code-cn", Some("en-US")), ("phone-us", Some("en-GB"))] {
            assert!(SpecialPreset::parse(preset, locale).is_err());
        }
    }
}
