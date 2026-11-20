//! 段选择：正/负/零/文本的默认分工，以及 `[>=100]` 一类条件段。
use super::lexer::{Section, Token};

/// 返回选中的段与要渲染的值。默认分工里的负数段显示绝对值，符号由段内字面量表达；
/// 条件段保留符号，避免 `[>=100]0;0` 把 -5 显示成 5。
pub(super) fn pick_number(sections: &[Section], n: f64) -> Option<(&Section, f64)> {
    // 第四段只给文本用。
    let numeric = &sections[..sections.len().min(3)];
    let signed = |index: usize| (&numeric[index], if index == 1 { n.abs() } else { n });
    if numeric.iter().take(2).any(|section| section.condition.is_some()) {
        for section in numeric.iter().take(2) {
            if section.condition.is_some_and(|condition| condition.matches(n)) {
                return Some((section, n));
            }
        }
        // 条件都不满足：交给第一个不带条件的段；全带条件时没有可用段，回退常规显示。
        let index = numeric.iter().position(|section| section.condition.is_none())?;
        return Some((&numeric[index], n));
    }
    let index = match numeric.len() {
        1 => 0,
        2 => usize::from(n < 0.0),
        _ if n > 0.0 => 0,
        _ if n < 0.0 => 1,
        _ => 2,
    };
    Some(signed(index))
}

/// 第四段是文本段；不足四段时，只有带 `@` 且不含数字占位的段才改写文本。
pub(super) fn pick_text(sections: &[Section]) -> Option<&Section> {
    if sections.len() == 4 {
        return sections.get(3);
    }
    sections.iter().find(|section| {
        section.has(|token| *token == Token::Text) && !section.is_date()
            && !section.has(|token| matches!(token, Token::Digit(_) | Token::General))
    })
}
