//! Accounting codes retain their named category when converted through XLSX.
use crate::native::NumberFormat;

pub fn builtin_code(id: u32) -> Option<&'static str> {
    match id {
        41 => Some(r#"_(* #,##0_);_(* \(#,##0\);_(* "-"_);_(@_)"#),
        42 => Some(r#"_("$"* #,##0_);_("$"* \(#,##0\);_("$"* "-"_);_(@_)"#),
        43 => Some(r#"_(* #,##0.00_);_(* \(#,##0.00\);_(* "-"??_);_(@_)"#),
        44 => Some(r#"_("$"* #,##0.00_);_("$"* \(#,##0.00\);_("$"* "-"??_);_(@_)"#),
        _ => None,
    }
}

pub fn code(symbol: &str, digits: u8) -> String {
    let digits = digits.min(15);
    if (symbol.is_empty() || symbol == "$") && (digits == 0 || digits == 2) {
        return builtin_code(41 + u32::from(symbol == "$") + if digits == 2 { 2 } else { 0 })
            .unwrap().into();
    }
    let symbol: String = symbol.chars().flat_map(|ch| ['\\', ch]).collect();
    let fraction = if digits == 0 { String::new() } else {
        format!(".{}", "0".repeat(usize::from(digits)))
    };
    let zeros = "?".repeat(usize::from(digits));
    format!("_({symbol}* #,##0{fraction}_);_({symbol}* \\(#,##0{fraction}\\);_({symbol}* \"-\"{zeros}_);_(@_)")
}

/// Recognize the complete accounting template, allowing equivalent literal spellings.
/// Quoted and escaped symbols are decoded only in their literal positions.
pub fn from_code(raw: &str) -> Option<NumberFormat> {
    let mut input = Code { rest: raw };
    let symbol = input.header()?;
    let digits = input.number()?;
    input.take("_);_(")?;
    if input.symbol()? != symbol { return None; }
    input.literal_char('(')?;
    if input.number()? != digits { return None; }
    input.literal_char(')')?;
    input.take(";_(")?;
    if input.symbol()? != symbol { return None; }
    input.literal_char('-')?;
    input.take(&"?".repeat(usize::from(digits)))?;
    input.take("_);_(@_)")?;
    input.rest.is_empty().then(|| format(&symbol, digits))
}

/// A bounded template reader, not a general numeric-format parser.
struct Code<'a> { rest: &'a str }

impl Code<'_> {
    fn take(&mut self, expected: &str) -> Option<()> {
        self.rest = self.rest.strip_prefix(expected)?;
        Some(())
    }

    fn header(&mut self) -> Option<String> {
        self.take("_(")?;
        self.symbol()
    }

    fn symbol(&mut self) -> Option<String> {
        let mut symbol = String::new();
        while !self.rest.starts_with("* ") {
            symbol.push_str(&self.literal()?);
        }
        self.take("* ")?;
        Some(symbol)
    }

    fn literal(&mut self) -> Option<String> {
        let ch = self.rest.chars().next()?;
        let value = if ch == '"' {
            let quoted = &self.rest[1..];
            let end = quoted.find('"')?;
            let value = quoted[..end].to_string();
            self.rest = &quoted[end + 1..];
            value
        } else if ch == '\\' {
            let escaped = &self.rest[1..];
            let value = escaped.chars().next()?;
            self.rest = &escaped[value.len_utf8()..];
            value.to_string()
        } else {
            // Bare symbols may contain currency/punctuation, never number/date directives.
            if ch.is_ascii_alphabetic() || "0#?.,;%@_*[]".contains(ch) { return None; }
            self.rest = &self.rest[ch.len_utf8()..];
            ch.to_string()
        };
        (!value.chars().any(char::is_control)).then_some(value)
    }

    fn literal_char(&mut self, expected: char) -> Option<()> {
        (self.literal()? == expected.to_string()).then_some(())
    }

    fn number(&mut self) -> Option<u8> {
        self.take("#,##0")?;
        if !self.rest.starts_with('.') { return Some(0); }
        self.take(".")?;
        let digits = self.rest.chars().take_while(|ch| *ch == '0').count();
        if digits == 0 || digits > 15 { return None; }
        self.rest = &self.rest[digits..];
        Some(digits as u8)
    }
}

fn format(symbol: &str, digits: u8) -> NumberFormat {
    NumberFormat { kind: "accounting".into(), symbol: Some(symbol.into()), digits: Some(digits),
        ..Default::default() }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builtin_and_custom_symbols_preserve_the_named_category() {
        for symbol in ["", "$", "€", "USD", "\";\\*yyyy"] {
            for digits in [0, 2, 3, 15] {
                assert_eq!(from_code(&code(symbol, digits)), Some(format(symbol, digits)));
            }
        }
        assert_eq!(from_code("_($* #,##0.00_)"), None);
    }

    fn external(symbol: &str, open: &str, close: &str) -> String {
        format!("_({symbol}* #,##0.00_);_({symbol}* {open}#,##0.00{close};_({symbol}* \"-\"??_);_(@_)")
    }

    #[test]
    fn external_literal_symbols_and_parentheses_keep_the_accounting_category() {
        for (spelling, decoded) in [
            (r#""€""#, "€"), (r#""USD""#, "USD"), ("€", "€"), ("$", "$"),
            (r#""U;@*[]()""#, "U;@*[]()"), (r#""U"\;"S""#, "U;S"),
            // Quoted backslash/parenthesis contents must not be globally normalized.
            (r#""\(""#, "\\("), (r#"\U\"\;\\\*"#, "U\";\\*"),
        ] {
            for (open, close) in [("(", ")"), (r"\(", r"\)"), (r#""(""#, r#"")""#)] {
                assert_eq!(from_code(&external(spelling, open, close)), Some(format(decoded, 2)),
                    "{spelling} {open} {close}");
            }
        }
    }

    #[test]
    fn incomplete_or_modified_templates_remain_custom() {
        let original = external(r#""€""#, "(", ")");
        for changed in [
            original.split(';').next().unwrap().to_string(),
            original.replace(";_(@_)", ""),
            original.replace(";_(@_)", ";@"),
            original.replace("* ", "*-"),
            original.replace("#,##0", "0"),
            original.replacen("0.00", "0.000", 1),
            original.replace("\"-\"??", "\"-\"?"),
            original.replacen("\"€\"", "\"$\"", 1),
            original.replace("_(\"€\"", "_([Red]\"€\""),
            format!("{original};@"),
            format!("{original} "),
        ] {
            assert_eq!(from_code(&changed), None, "{changed}");
        }
    }
}
