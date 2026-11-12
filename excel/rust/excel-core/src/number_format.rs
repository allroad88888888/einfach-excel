//! Numeric display categories and their plain-text formatting.
use crate::CellFormat;

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub enum NumberFormat {
    #[default]
    General,
    /// 后续用户输入按文本保存；设置格式本身不改变已有值或公式。
    Text,
    /// Fixed decimal places.
    Decimal {
        digits: u8,
        thousands: bool,
    },
    Percent {
        digits: u8,
    },
    /// `¥1,234.56`
    Currency {
        symbol: String,
        digits: u8,
    },
    /// Currency symbol at the left edge, numeric body at the right edge.
    Accounting { symbol: String, digits: u8 },
    /// Custom strftime-like date format, e.g. "yyyy-mm-dd".
    Date(String),
    Time(String),
    Scientific { digits: u8 },
    Fraction { denominator: crate::FractionDenominator },
    /// Excel-style custom numeric pattern. The formatter intentionally covers
    /// a small display subset while preserving the raw pattern for WASM/JS
    /// round-trip.
    Custom(String),
}

impl CellFormat {
    /// Apply this format to a numeric value, returning the user-visible
    /// string. For non-numeric inputs the caller should fall back to the
    /// default display path.
    pub fn format_number(&self, n: f64) -> String {
        match &self.number_format {
            NumberFormat::General | NumberFormat::Text => default_number_string(n),
            NumberFormat::Decimal { digits, thousands } => format_fixed(n, *digits, *thousands, ""),
            NumberFormat::Percent { digits } => format_fixed(n * 100.0, *digits, false, "%"),
            NumberFormat::Currency { symbol, digits } => {
                let body = format_fixed(n, *digits, true, "");
                format!("{}{}", symbol, body)
            }
            NumberFormat::Accounting { symbol, digits } => crate::accounting_format::display(symbol, *digits, n)
                .map_or_else(|| default_number_string(n), |shown| shown.text),
            NumberFormat::Date(pattern) => crate::date_format::format_date(pattern, n)
                .unwrap_or_else(|| default_number_string(n)),
            NumberFormat::Time(pattern) => crate::time_format::format_time(pattern, n),
            NumberFormat::Scientific { digits } => crate::scientific_format::format_scientific(n, *digits),
            NumberFormat::Fraction { denominator } => crate::fraction_format::format_fraction(n, *denominator),
            NumberFormat::Custom(pattern) => crate::custom_number_format::format_number(pattern, n)
                .map(|display| display.text)
                .unwrap_or_else(|| default_number_string(n)),
        }
    }
}

/// 「General」格式下一个数字长什么样 —— 直接委托给 Excel General 转文本的单点
/// 实现 [`crate::general_text::excel_general_to_text`]。
///
/// 这里**不重写**一份规格。曾经有过：`if n == n.floor() && n.abs() < 1e15 { i64 }
/// else { Display }` 这段与 `eval::coerce_to_text`、`csv::value_to_csv_field`
/// 逐字节相同却互不调用，于是 `=10^21&""` 一改就与裸数字 `=10^21` 的**显示**
/// 对不上（前者 `1E+21`，后者 22 位数字铺开）。同一个数字在同一个引擎里有两种
/// 写法，是复制粘贴的直接产物。
///
/// Excel 对一个 f64 确实有多套规则，但**转文本与 General 显示不在其中分家**：
/// 分家的是列宽自适应（窄列会更早退到科学计数甚至 `####`）与显式
/// `NumberFormat`，而这两条都在本函数**之外** —— 列宽是渲染层的事，显式格式走
/// `format_fixed` / `custom_number_format`。落到这里的只有「没有格式、按 General
/// 走」这一种情况，它和 `&` 拼接读到的文本是同一个答案。
pub(crate) fn default_number_string(n: f64) -> String {
    crate::general_text::excel_general_to_text(n)
}

fn format_fixed(n: f64, digits: u8, thousands: bool, suffix: &str) -> String {
    // 与既有 UI 一致：半数远离零。format! 本身的 ties-to-even 不用于决定舍入。
    let factor = 10_f64.powi(i32::from(digits));
    let scaled = n * factor;
    let rounded = if scaled.is_finite() { scaled.round() / factor } else { n };
    let n = if rounded == 0.0 { 0.0 } else { rounded };
    let formatted = format!("{:.*}", digits as usize, n);
    let body = if thousands {
        // Insert thousands separators in the integer part.
        let (int_part, frac_part) = match formatted.split_once('.') {
            Some((i, f)) => (i, Some(f)),
            None => (formatted.as_str(), None),
        };
        let (sign, digits_str) = match int_part.strip_prefix('-') {
            Some(rest) => ("-", rest),
            None => ("", int_part),
        };
        let with_commas = insert_commas(digits_str);
        match frac_part {
            Some(f) => format!("{sign}{with_commas}.{f}"),
            None => format!("{sign}{with_commas}"),
        }
    } else {
        formatted
    };
    format!("{}{}", body, suffix)
}

fn insert_commas(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len() + bytes.len() / 3);
    for (i, &b) in bytes.iter().enumerate() {
        let from_right = bytes.len() - i;
        if i > 0 && from_right % 3 == 0 {
            out.push(b',');
        }
        out.push(b);
    }
    String::from_utf8(out).unwrap()
}

