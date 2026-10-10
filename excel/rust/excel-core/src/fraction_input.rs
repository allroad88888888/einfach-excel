//! 仅识别显式整数部分的分数，避免把 1/2 之类的歧义日期改成数字。
use crate::cell_input::CellInput;

pub(crate) fn parse_fraction(input: &str) -> Option<CellInput> {
    let (negative, unsigned) = match input.as_bytes().first()? {
        b'-' => (true, &input[1..]),
        b'+' => (false, &input[1..]),
        _ => (false, input),
    };
    let (whole, fraction) = unsigned.split_once(' ')?;
    let (numerator, denominator) = fraction.trim_start_matches(' ').split_once('/')?;
    if ![whole, numerator, denominator]
        .iter()
        .all(|part| !part.is_empty() && part.bytes().all(|byte| byte.is_ascii_digit()))
    {
        return None;
    }
    let whole: f64 = whole.parse().ok()?;
    let numerator: u32 = numerator.parse().ok()?;
    let denominator: u32 = denominator.parse().ok()?;
    if denominator == 0 {
        return None;
    }
    let value = (whole + numerator as f64 / denominator as f64) * if negative { -1.0 } else { 1.0 };
    if !value.is_finite() {
        return None;
    }
    // 保留输入分母，0 2/8 不会被自动改写成 1/4。
    Some(CellInput::Fraction { value, denominator })
}
