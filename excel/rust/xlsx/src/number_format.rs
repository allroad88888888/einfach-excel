//! XLSX 数字格式代码与原生数字格式类别互转。认不出的代码原样作为 custom 保留。

use crate::native::NumberFormat;

/// ECMA-376 内置 numFmtId（未列出的 id 依地区而定，按 General 处理）。
pub fn builtin_code(id: u32) -> Option<&'static str> {
    Some(match id {
        0 => "General",
        1 => "0",
        2 => "0.00",
        3 => "#,##0",
        4 => "#,##0.00",
        9 => "0%",
        10 => "0.00%",
        11 => "0.00E+00",
        12 => "# ?/?",
        13 => "# ??/??",
        14 => "m/d/yyyy",
        15 => "d-mmm-yy",
        16 => "d-mmm",
        17 => "mmm-yy",
        18 => "h:mm AM/PM",
        19 => "h:mm:ss AM/PM",
        20 => "h:mm",
        21 => "h:mm:ss",
        22 => "m/d/yyyy h:mm",
        37 => "#,##0 ;(#,##0)",
        38 => "#,##0 ;[Red](#,##0)",
        39 => "#,##0.00;(#,##0.00)",
        40 => "#,##0.00;[Red](#,##0.00)",
        45 => "mm:ss",
        46 => "[h]:mm:ss",
        47 => "mm:ss.0",
        48 => "##0.0E+0",
        49 => "@",
        _ => return None,
    })
}

pub fn builtin_id(code: &str) -> Option<u32> {
    (0..=49).find(|&id| builtin_code(id) == Some(code))
}

fn format(kind: &str) -> NumberFormat {
    NumberFormat { kind: kind.into(), ..Default::default() }
}

fn decimals(fraction: &str) -> Option<u8> {
    let zeros = fraction.strip_prefix('.').unwrap_or(fraction);
    (zeros.chars().all(|c| c == '0') && zeros.len() <= 15).then_some(zeros.len() as u8)
}

/// 去掉引号文字与转义后判断是不是日期/时间代码。
fn date_time_tokens(code: &str) -> (bool, bool) {
    let mut plain = String::new();
    let mut quoted = false;
    let mut chars = code.chars();
    while let Some(c) = chars.next() {
        match c {
            '"' => quoted = !quoted,
            '\\' => {
                chars.next();
            }
            '[' if !quoted => {
                // [Red]、[$-409] 之类不是日期记号；[h]/[mm]/[ss] 是经过时间。
                let inner: String = chars.by_ref().take_while(|&c| c != ']').collect();
                if inner.chars().all(|c| matches!(c.to_ascii_lowercase(), 'h' | 'm' | 's')) {
                    plain.push_str(&inner);
                }
            }
            _ if !quoted => plain.push(c.to_ascii_lowercase()),
            _ => {}
        }
    }
    let date = plain.contains('y') || plain.contains('d');
    let time = plain.contains('h') || plain.contains('s');
    (date, time)
}

pub fn from_code(code: &str) -> NumberFormat {
    if code.eq_ignore_ascii_case("general") {
        return format("general");
    }
    if code == "@" {
        return format("text");
    }
    let (date, time) = date_time_tokens(code);
    if date || time {
        let kind = if date { "date" } else { "time" };
        return NumberFormat { pattern: Some(code.into()), ..format(kind) };
    }
    if let Some(body) = code.strip_suffix('%') {
        if let Some(digits) = body.strip_prefix('0').and_then(decimals) {
            return NumberFormat { digits: Some(digits), ..format("percent") };
        }
    }
    let (thousands, rest) = match code.strip_prefix("#,##0") {
        Some(rest) => (true, rest),
        None => (false, code.strip_prefix('0').unwrap_or("x")),
    };
    if let Some(digits) = decimals(rest) {
        return NumberFormat { digits: Some(digits), thousands: Some(thousands), ..format("number") };
    }
    NumberFormat { pattern: Some(code.into()), ..format("custom") }
}

fn zeros(digits: u8) -> String {
    if digits == 0 {
        String::new()
    } else {
        format!(".{}", "0".repeat(usize::from(digits)))
    }
}

pub fn to_code(format: &NumberFormat) -> String {
    let digits = format.digits;
    match format.kind.as_str() {
        "text" => "@".into(),
        "number" | "decimal" => {
            let integer = if format.thousands == Some(true) { "#,##0" } else { "0" };
            format!("{integer}{}", zeros(digits.unwrap_or(2)))
        }
        "percent" | "percentage" => format!("0{}%", zeros(digits.unwrap_or(0))),
        "currency" => {
            let symbol = format.symbol.as_deref().unwrap_or("$").replace('"', "");
            format!("\"{symbol}\"#,##0{}", zeros(digits.unwrap_or(2)))
        }
        "scientific" => format!("0{}E+00", zeros(digits.unwrap_or(2))),
        "fraction" => match format.denominator.as_ref().and_then(|value| value.as_u64()) {
            Some(denominator) if denominator > 0 => format!("# ?/{denominator}"),
            _ => "# ?/?".into(),
        },
        "date" | "time" | "custom" => {
            format.pattern.clone().unwrap_or_else(|| "General".into())
        }
        _ => "General".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_common_codes() {
        assert_eq!(from_code("General").kind, "general");
        assert_eq!(from_code("0.00%").digits, Some(2));
        let money = from_code("#,##0.000");
        assert_eq!((money.kind.as_str(), money.digits, money.thousands), ("number", Some(3), Some(true)));
        assert_eq!(from_code("yyyy-mm-dd").kind, "date");
        assert_eq!(from_code("[h]:mm:ss").kind, "time");
        assert_eq!(from_code("[Red]0.0;\"day\"").kind, "custom");
        assert_eq!(from_code("0.0\" kg\"").kind, "custom");
    }

    #[test]
    fn writes_codes_that_classify_back() {
        for code in ["0.00", "#,##0", "0%", "0.000%", "@", "yyyy-mm-dd", "h:mm", "0.00E+00"] {
            assert_eq!(to_code(&from_code(code)), code);
        }
        assert_eq!(builtin_id("0.00%"), Some(10));
    }
}
