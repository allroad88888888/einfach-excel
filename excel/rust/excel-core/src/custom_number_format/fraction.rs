//! 自定义代码里的分数：`# ?/?`、`# ??/??`、固定分母 `# ?/8`，以及没有整数部分的 `?/?`。
//! 最佳近似沿用分数类别的 `best_fraction`，这里只负责按占位符排版。
use super::lexer::Token;
use super::number::integer_slots;
use super::output::Out;
use crate::fraction_format::best_fraction;

struct Layout {
    int: Vec<usize>,
    numerator: Vec<usize>,
    slash: usize,
    denominator: Denominator,
}

enum Denominator {
    /// `?`/`#`/`0` 占位：最大分母为 10^位数 - 1，保留强制零，`?` 补白右对齐。
    Digits(Vec<usize>),
    /// 字面分母（`/8`、`/16`）：记号区间与分母值。
    Fixed(std::ops::Range<usize>, u32),
}

impl Layout {
    fn of(tokens: &[Token]) -> Option<Self> {
        let digit = |index: usize| matches!(tokens.get(index), Some(Token::Digit(_)));
        let slash = (1..tokens.len())
            .find(|index| tokens[*index] == Token::Slash && digit(index - 1))?;
        let start = (0..slash).rev().take_while(|index| digit(*index)).last()?;
        let numerator: Vec<usize> = (start..slash).collect();
        let int = (0..start).filter(|index| digit(*index)).collect();
        let after: Vec<usize> = (slash + 1..tokens.len()).take_while(|index| digit(*index)).collect();
        let denominator = if !after.is_empty() {
            Denominator::Digits(after)
        } else {
            let fixed: String = tokens[slash + 1..].iter().map_while(|token| match token {
                Token::Literal(text) if text.len() == 1 && text.chars().all(|c| c.is_ascii_digit()) =>
                    Some(text.clone()),
                Token::Digit('0') => Some("0".into()),
                _ => None,
            }).collect();
            let value: u32 = fixed.parse().ok().filter(|value| *value > 0)?;
            Denominator::Fixed(slash + 1..slash + 1 + fixed.len(), value)
        };
        Some(Layout { int, numerator, slash, denominator })
    }
}

/// 不是分数布局时返回 `None`，交回普通数字渲染。
pub(super) fn render(tokens: &[Token], value: f64) -> Option<Out> {
    let layout = Layout::of(tokens)?;
    let denominator_end = match &layout.denominator {
        Denominator::Digits(digits) => digits.last()? + 1,
        Denominator::Fixed(range, _) => range.end,
    };
    // 分数也先缩放再近似；转义的 `%`/`,` 是 Literal，不参与缩放。
    let percent = tokens.iter().filter(|token| **token == Token::Percent).count();
    let scale = tokens[denominator_end..].iter().filter(|token| **token == Token::Comma).count();
    let magnitude = value.abs() * 100f64.powi(percent as i32) / 1000f64.powi(scale as i32);
    let has_int = !layout.int.is_empty();
    let mut whole = if has_int { magnitude.floor() } else { 0.0 };
    // `?/?` 没有整数部分时整个值参与近似，整数自然并进分子。
    let fraction = magnitude - whole;
    let (mut numerator, denominator) = match &layout.denominator {
        Denominator::Fixed(_, fixed) => ((fraction * f64::from(*fixed)).round() as u32, *fixed),
        Denominator::Digits(digits) => {
            best_fraction(fraction, 10u32.pow(digits.len().min(4) as u32) - 1)
        }
    };
    if has_int && numerator == denominator {
        whole += 1.0;
        numerator = 0;
    }
    let mut out = Out::default();
    if value < 0.0 && (whole != 0.0 || numerator != 0) {
        out.push('-');
    }
    let whole_text = if whole == 0.0 && numerator != 0 { String::new() } else { format!("{whole:.0}") };
    let int_slots = integer_slots(tokens, &layout.int, &whole_text);
    // 分子为 0 时 Excel 只显示整数，分数位置留同宽空白以保持对齐。
    let blank = has_int && numerator == 0;
    let numerator_slots = integer_slots(tokens, &layout.numerator, &numerator.to_string());
    let denominator_text = match &layout.denominator {
        Denominator::Digits(digits) => denominator_text(tokens, digits, denominator),
        Denominator::Fixed(_, _) => denominator.to_string(),
    };
    for (index, token) in tokens.iter().enumerate() {
        if let Some(slot) = layout.int.iter().position(|i| *i == index) {
            out.push_str(&int_slots[slot]);
        } else if let Some(slot) = layout.numerator.iter().position(|i| *i == index) {
            out.push_str(&hide(&numerator_slots[slot], blank));
        } else if index == layout.slash {
            out.push_str(if blank { " " } else { "/" });
        } else {
            match &layout.denominator {
                Denominator::Digits(digits) => if let Some(slot) = digits.iter().position(|i| *i == index) {
                    if slot == 0 {
                        out.push_str(&hide(&denominator_text, blank));
                    }
                    continue;
                },
                Denominator::Fixed(range, _) if range.contains(&index) => {
                    if index == range.start {
                        out.push_str(&hide(&denominator_text, blank));
                    }
                    continue;
                }
                Denominator::Fixed(..) => {}
            }
            if index >= denominator_end && *token == Token::Comma {
                continue;
            }
            out.literal(token);
        }
    }
    Some(out)
}

/// 分母与分子一样按占位补零；只有前导 `?` 留白移到末尾，使分数线两侧对齐。
fn denominator_text(tokens: &[Token], digits: &[usize], value: u32) -> String {
    let text = integer_slots(tokens, digits, &value.to_string()).concat();
    let visible = text.trim_start_matches(' ');
    format!("{}{}", visible, " ".repeat(text.len() - visible.len()))
}

fn hide(text: &str, blank: bool) -> String {
    if blank { " ".repeat(text.chars().count()) } else { text.to_string() }
}
