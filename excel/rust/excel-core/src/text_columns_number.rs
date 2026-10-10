//! 分列的地区数字语法：验证分组后才归一化，不按系统地区猜测或盲删分隔符。

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TextColumnsNumberOptions {
    pub decimal_separator: char,
    pub group_separator: Option<char>,
    pub trailing_minus: bool,
}

impl Default for TextColumnsNumberOptions {
    fn default() -> Self {
        Self { decimal_separator: '.', group_separator: None, trailing_minus: false }
    }
}

impl TextColumnsNumberOptions {
    pub fn validate(&self) -> Result<(), &'static str> {
        if !matches!(self.decimal_separator, '.' | ',') {
            return Err("Choose dot or comma as the decimal separator.");
        }
        if self.group_separator.is_some_and(|separator|
            !matches!(separator, '.' | ',' | ' ' | '\u{a0}' | '\u{202f}' | '\'')) {
            return Err("Unsupported thousands separator.");
        }
        if self.group_separator == Some(self.decimal_separator) {
            return Err("Decimal and thousands separators must be different.");
        }
        Ok(())
    }

    /// 只返回完整、无歧义的数字词法；有限数校验和百分比格式继续交给既有原生输入解析。
    pub(crate) fn normalize(&self, text: &str) -> Option<String> {
        let mut body = text.trim();
        let trailing = body.ends_with('-');
        if trailing {
            if !self.trailing_minus { return None; }
            body = body.strip_suffix('-')?.trim_end();
        }
        let percentage = body.ends_with('%');
        if percentage { body = body.strip_suffix('%')?.trim_end(); }
        let mut sign = if trailing { "-" } else { "" };
        if body.starts_with(['+', '-']) {
            if trailing { return None; }
            sign = &body[..1];
            body = &body[1..];
        }
        let (mantissa, exponent) = body.split_once(['e', 'E']).unwrap_or((body, ""));
        if mantissa.len() != body.len() {
            let digits = exponent.strip_prefix(['+', '-']).unwrap_or(exponent);
            if !ascii_digits(digits) { return None; }
        }
        let mut parts = mantissa.split(self.decimal_separator);
        let integer = parts.next()?;
        let fraction = parts.next();
        if parts.next().is_some() || fraction.is_some_and(|part| !part.bytes().all(|b| b.is_ascii_digit())) {
            return None;
        }
        let integer = if let Some(separator) = self.group_separator.filter(|separator| integer.contains(*separator)) {
            let mut groups = integer.split(separator);
            let first = groups.next()?;
            if first.len() > 3 || !ascii_digits(first) { return None; }
            let mut combined = first.to_owned();
            for group in groups {
                if group.len() != 3 || !ascii_digits(group) { return None; }
                combined.push_str(group);
            }
            combined
        } else {
            if !integer.bytes().all(|b| b.is_ascii_digit()) { return None; }
            integer.to_owned()
        };
        if integer.is_empty() && fraction.is_none_or(str::is_empty) { return None; }
        let mut normalized = format!("{sign}{integer}");
        if let Some(fraction) = fraction {
            normalized.push('.');
            normalized.push_str(fraction);
        }
        if !exponent.is_empty() {
            normalized.push('e');
            normalized.push_str(exponent);
        }
        if percentage { normalized.push('%'); }
        Some(normalized)
    }
}

fn ascii_digits(text: &str) -> bool {
    !text.is_empty() && text.bytes().all(|b| b.is_ascii_digit())
}
