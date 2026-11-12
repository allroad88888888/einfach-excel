//! 整条代码：按 `;` 切段（尊重引号、转义与方括号），逐段记号化并做结构校验。
use super::lexer::{tokenize, Section, Token};
use super::CustomFormatError;

/// Excel 自定义代码的长度上限。
const MAX_PATTERN_CHARS: usize = 255;

pub(super) fn parse_pattern(pattern: &str) -> Result<Vec<Section>, CustomFormatError> {
    if pattern.trim().is_empty() {
        return Err(CustomFormatError::Empty);
    }
    if pattern.chars().count() > MAX_PATTERN_CHARS {
        return Err(CustomFormatError::TooLong);
    }
    let raw = split_sections(pattern);
    if raw.len() > 4 {
        return Err(CustomFormatError::TooManySections);
    }
    raw.iter().map(|section| {
        let section = tokenize(section)?;
        check_section(&section)?;
        Ok(section)
    }).collect()
}

fn check_section(section: &Section) -> Result<(), CustomFormatError> {
    if section.is_date() {
        return Ok(());
    }
    let digits = section.has(|token| matches!(token, Token::Digit(_) | Token::General));
    if digits && section.has(|token| *token == Token::Text) {
        return Err(CustomFormatError::TextWithDigits);
    }
    // 科学计数的指数部分之后不会再有小数点；同一段只能有一个小数点。
    let points = section.tokens.iter().filter(|token| **token == Token::Point).count();
    if points > 1 {
        return Err(CustomFormatError::MultipleDecimalPoints);
    }
    Ok(())
}

fn split_sections(pattern: &str) -> Vec<String> {
    let mut sections = Vec::new();
    let mut buffer = String::new();
    let mut in_string = false;
    let mut in_bracket = false;
    let mut chars = pattern.chars();

    while let Some(ch) = chars.next() {
        buffer.push(ch);
        if !in_string && matches!(ch, '\\' | '_' | '*') {
            // 被转义／留白／填充的那个字符不是分段符。
            if let Some(next) = chars.next() {
                buffer.push(next);
            }
            continue;
        }
        match ch {
            '"' if !in_bracket => in_string = !in_string,
            '[' if !in_string => in_bracket = true,
            ']' if !in_string => in_bracket = false,
            ';' if !in_string && !in_bracket => {
                buffer.pop();
                sections.push(std::mem::take(&mut buffer));
            }
            _ => {}
        }
    }

    sections.push(buffer);
    sections
}
