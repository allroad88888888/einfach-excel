//! 数字段渲染：占位符从右向左取位，字面量按原位置穿插（`000-00-0000`），
//! 千分位、尾随逗号缩放、百分号与科学计数在这里合成。
use super::datetime;
use super::fraction;
use super::lexer::{Section, Token};
use super::output::Out;
use super::scientific;

struct Layout {
    int: Vec<usize>,
    frac: Vec<usize>,
    point: Option<usize>,
    exponent: Option<usize>,
    grouping: bool,
    scale: i32,
    percent: i32,
}

impl Layout {
    fn of(tokens: &[Token]) -> Self {
        let exponent = tokens.iter().position(|t| matches!(t, Token::Exponent { .. }));
        let end = exponent.unwrap_or(tokens.len());
        let point = tokens[..end].iter().position(|t| *t == Token::Point);
        let digit = |index: &usize| matches!(tokens[*index], Token::Digit(_));
        let int: Vec<usize> = (0..point.unwrap_or(end)).filter(digit).collect();
        let frac: Vec<usize> = point.map_or(Vec::new(), |p| (p + 1..end).filter(digit).collect());
        let (mut grouping, mut scale) = (false, 0);
        for index in (0..end).filter(|index| tokens[*index] == Token::Comma) {
            match (int.first(), int.last()) {
                (Some(first), Some(last)) if index > *first && index < *last => grouping = true,
                (_, Some(last)) if index > *last => scale += 1,
                (None, None) => scale += 1,
                _ => {}
            }
        }
        let percent = tokens.iter().filter(|t| **t == Token::Percent).count() as i32;
        Layout { int, frac, point, exponent, grouping, scale, percent }
    }
}

pub(super) fn render(section: &Section, value: f64) -> Out {
    if section.is_date() {
        return datetime::render(section, value);
    }
    let tokens = &section.tokens;
    if section.has(|t| *t == Token::General) {
        return render_general(tokens, value);
    }
    if !section.has(|t| matches!(t, Token::Digit(_))) {
        return render_literals(tokens);
    }
    if let Some(out) = fraction::render(tokens, value) {
        return out;
    }
    let layout = Layout::of(tokens);
    let scaled = value.abs() * 100f64.powi(layout.percent) / 1000f64.powi(layout.scale);
    let frac_count = layout.frac.len();
    let (mantissa, exponent) = match layout.exponent {
        Some(_) => {
            let engineering = layout.int.len() > 1
                && layout.int.iter().any(|index| tokens[*index] == Token::Digit('#'));
            let parts = scientific::split(scaled, layout.int.len(), engineering, frac_count);
            (parts.mantissa, Some(parts.exponent))
        }
        None => (round_half_away(scaled, frac_count), None),
    };
    let fixed = format!("{:.*}", frac_count, mantissa);
    let (whole, fraction) = fixed.split_once('.').unwrap_or((&fixed, ""));
    let whole = if whole == "0" { "" } else { whole };
    let slots = integer_slots(tokens, &layout.int, whole);
    let frac_text = fraction_text(tokens, &layout.frac, fraction);
    let total: usize = slots.iter().map(|slot| slot.chars().count()).sum();

    let mut out = Out::default();
    if value < 0.0 && mantissa != 0.0 {
        out.push('-');
    }
    let mut emitted = 0;
    for (index, token) in tokens.iter().enumerate() {
        if let Some(slot) = layout.int.iter().position(|i| *i == index) {
            for ch in slots[slot].chars() {
                out.push(ch);
                emitted += 1;
                let from_right = total - emitted;
                if layout.grouping && ch.is_ascii_digit() && from_right > 0 && from_right % 3 == 0 {
                    out.push(',');
                }
            }
            continue;
        }
        if let Some(slot) = layout.frac.iter().position(|i| *i == index) {
            out.push_str(&frac_text[slot]);
            continue;
        }
        match token {
            Token::Point if Some(index) == layout.point => {
                if layout.int.is_empty() {
                    out.push_str(whole);
                }
                out.push('.');
            }
            Token::Exponent { plus } if Some(index) == layout.exponent => {
                let zeros = tokens[index + 1..].iter()
                    .filter(|t| matches!(t, Token::Digit('0'))).count();
                out.push_str(&scientific::exponent_text(exponent.unwrap_or(0), *plus, zeros));
            }
            Token::Digit(_) | Token::Text | Token::Date(_) => {}
            Token::Comma if index > layout.int.first().copied().unwrap_or(0) => {}
            other => out.literal(other),
        }
    }
    out
}

/// 半数远离零；与固定小数类别一致，不用 `format!` 的银行家舍入决定进位。
pub(super) fn round_half_away(value: f64, digits: usize) -> f64 {
    let factor = 10f64.powi(digits as i32);
    let rounded = (value * factor).round() / factor;
    if rounded.is_finite() { rounded } else { value }
}

/// 整数位从右向左对齐占位；位数多于占位时，多出的位全部给最左一个占位。
pub(super) fn integer_slots(tokens: &[Token], placeholders: &[usize], whole: &str) -> Vec<String> {
    let digits: Vec<char> = whole.chars().collect();
    let count = placeholders.len();
    let overflow = digits.len().saturating_sub(count);
    let missing = count.saturating_sub(digits.len());
    placeholders.iter().enumerate().map(|(slot, index)| {
        if slot == 0 && overflow > 0 {
            return digits[..=overflow].iter().collect();
        }
        if slot >= missing {
            return digits[slot - missing + overflow].to_string();
        }
        empty_digit(&tokens[*index]).to_string()
    }).collect()
}

/// 小数位逐位对齐；有效数字之后的 `#` 省略、`?` 补空格、`0` 保留。
fn fraction_text(tokens: &[Token], placeholders: &[usize], fraction: &str) -> Vec<String> {
    let digits: Vec<char> = fraction.chars().collect();
    let significant = digits.iter().rposition(|ch| *ch != '0');
    placeholders.iter().enumerate().map(|(slot, index)| {
        match (significant, digits.get(slot)) {
            (Some(last), Some(ch)) if slot <= last => ch.to_string(),
            _ => empty_digit(&tokens[*index]).to_string(),
        }
    }).collect()
}

fn empty_digit(token: &Token) -> &'static str {
    match token {
        Token::Digit('0') => "0",
        Token::Digit('?') => " ",
        _ => "",
    }
}

fn render_general(tokens: &[Token], value: f64) -> Out {
    let mut out = Out::default();
    for token in tokens {
        match token {
            Token::General => out.push_str(&crate::excel_general_to_text(value)),
            other => out.literal(other),
        }
    }
    out
}

fn render_literals(tokens: &[Token]) -> Out {
    let mut out = Out::default();
    for token in tokens {
        out.literal(token);
    }
    out
}
