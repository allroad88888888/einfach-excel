//! Conversion of the supported named Special presets, independent of the engine crate.
use crate::native::NumberFormat;
use serde::Deserialize;

const PRESETS: [(&str, &str, &str); 5] = [
    ("zip-code", "en-US", "00000"),
    ("zip-plus-4", "en-US", r"00000\-0000"),
    ("phone-us", "en-US", r"[<=9999999]###\-####;\(###\)\ ###\-####"),
    ("ssn-us", "en-US", r"000\-00\-0000"),
    ("postal-code-cn", "zh-CN", "000000"),
];

fn resolve(preset: &str, locale: Option<&str>) -> Result<(&'static str, &'static str), &'static str> {
    let entry = PRESETS.iter().find(|entry| entry.0 == preset).ok_or("unsupported special preset")?;
    if locale.is_some_and(|value| !matches!(value, "en-US" | "zh-CN")) {
        return Err("unsupported special locale");
    }
    if locale.is_some_and(|value| value != entry.1) { return Err("special preset and locale do not match"); }
    Ok((entry.1, entry.2))
}

pub fn to_code(format: &NumberFormat) -> String {
    resolve(format.preset.as_deref().expect("validated special preset"), format.locale.as_deref())
        .expect("validated special format").1.into()
}

pub fn from_code(code: &str) -> Option<NumberFormat> {
    let (plain, locale) = normalize(code)?;
    PRESETS.iter().find_map(|&(preset, region, pattern)| {
        (normalize(pattern)?.0 == plain && locale.is_none_or(|value| value == region)).then(|| NumberFormat {
            kind: "special".into(), preset: Some(preset.into()), locale: Some(region.into()),
            ..Default::default()
        })
    })
}

/// Decode only literal punctuation used by these exact codes. Locale tags are accepted
/// only at section starts, never inside quoted text or at arbitrary numeric positions.
fn normalize(code: &str) -> Option<(String, Option<&'static str>)> {
    let mut chars = code.chars();
    let mut out = String::new();
    let mut locale = None;
    while let Some(ch) = chars.next() {
        match ch {
            '"' => {
                let mut closed = false;
                for ch in chars.by_ref() {
                    if ch == '"' { closed = true; break; }
                    if !matches!(ch, '-' | '(' | ')' | ' ') { return None; }
                    out.push(ch);
                }
                if !closed { return None; }
            }
            '\\' => {
                let ch = chars.next()?;
                if !matches!(ch, '-' | '(' | ')' | ' ') { return None; }
                out.push(ch);
            }
            '[' => {
                let mut tag = String::new();
                let mut closed = false;
                for ch in chars.by_ref() {
                    if ch == ']' { closed = true; break; }
                    tag.push(ch);
                }
                if !closed { return None; }
                let region = match tag.as_str() { "$-409" => Some("en-US"), "$-804" => Some("zh-CN"), _ => None };
                if let Some(region) = region {
                    if (!out.is_empty() && !out.ends_with(';')) || locale.is_some_and(|old| old != region) {
                        return None;
                    }
                    locale = Some(region);
                } else { out.push('['); out.push_str(&tag); out.push(']'); }
            }
            ch => out.push(ch),
        }
    }
    Some((out, locale))
}

/// The native file converter validates named presets before exporting anything.
#[derive(Deserialize)]
pub(crate) struct FormatInput {
    kind: String,
    #[serde(default)] digits: Option<u8>,
    #[serde(default)] symbol: Option<String>,
    #[serde(default)] pattern: Option<String>,
    #[serde(default)] thousands: Option<bool>,
    #[serde(default)] denominator: Option<serde_json::Value>,
    #[serde(default)] preset: Option<String>,
    #[serde(default)] locale: Option<String>,
}

impl TryFrom<FormatInput> for NumberFormat {
    type Error = &'static str;
    fn try_from(mut value: FormatInput) -> Result<Self, Self::Error> {
        if value.kind == "special" {
            let (locale, _) = resolve(value.preset.as_deref().ok_or("special requires a preset")?, value.locale.as_deref())?;
            value.locale = Some(locale.into());
        } else if value.preset.is_some() || value.locale.is_some() {
            return Err("preset and locale are only supported for special formats");
        }
        Ok(Self { kind: value.kind, digits: value.digits, symbol: value.symbol, pattern: value.pattern,
            thousands: value.thousands, denominator: value.denominator, preset: value.preset, locale: value.locale })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_codes_and_literal_variants_restore_named_presets() {
        for (preset, locale, code) in PRESETS {
            let format = from_code(code).unwrap();
            assert_eq!(format.preset.as_deref(), Some(preset));
            assert_eq!(format.locale.as_deref(), Some(locale));
            assert_eq!(to_code(&format), code);
        }
        assert_eq!(from_code("00000-0000").unwrap().preset.as_deref(), Some("zip-plus-4"));
        assert_eq!(from_code("000\"-\"00\"-\"0000").unwrap().preset.as_deref(), Some("ssn-us"));
        assert_eq!(from_code("[$-804]000000").unwrap().locale.as_deref(), Some("zh-CN"));
        for code in ["[$-804]00000", "[$-409]000000", "00000\" kg\"", "0000000", "00000;0", "\"00000\""] {
            assert_eq!(from_code(code), None, "{code}");
        }
    }

    #[test]
    fn invalid_native_presets_and_pairs_reject_instead_of_exporting_general() {
        for value in [serde_json::json!({"kind":"special"}),
            serde_json::json!({"kind":"special","preset":"unknown"}),
            serde_json::json!({"kind":"special","preset":"zip-code","locale":"zh-CN"}),
            serde_json::json!({"kind":"special","preset":"zip-code","locale":"en-GB"})] {
            assert!(serde_json::from_value::<NumberFormat>(value).is_err());
        }
    }
}
