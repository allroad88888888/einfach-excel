//! 科学计数显示只调整文本精度，不回写数值。
pub(crate) fn format_scientific(number: f64, digits: u8) -> String {
    if !number.is_finite() {
        return "#####".into();
    }
    let digits = usize::from(digits.min(15));
    let (raw, exponent) = if number.is_subnormal() {
        // 最短次正规数可能只有一个有效数字（5e-324），精度显示需保留真实尾数。
        let text = format!("{:.17e}", number.abs());
        let (mantissa, exponent) = text.split_once('e').expect("finite scientific number");
        (
            mantissa.replace('.', ""),
            exponent.parse().expect("integer exponent"),
        )
    } else {
        crate::general_text::shortest_digits(number.abs())
    };
    // 复用已有十进制 half-up 收位，不能让 Rust 默认 half-even 把 1.25 显示成 1.2。
    let (rounded, exponent) = crate::general_text::round_significant(&raw, exponent, digits + 1);
    let sign = if number < 0.0 { "-" } else { "" };
    let mantissa = if digits == 0 {
        rounded
    } else {
        format!("{}.{}", &rounded[..1], &rounded[1..])
    };
    format!("{sign}{mantissa}E{exponent:+03}")
}
