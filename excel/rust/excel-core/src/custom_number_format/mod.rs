//! Excel 自定义数字格式代码的唯一显示实现：网格文本、对话框预览与自动列宽都读这里。
//!
//! 一条代码最多四段（正;负;零;文本），每段可带颜色 `[Red]`/`[ColorN]`、条件 `[>=100]`、
//! 货币/区域标签 `[$¥-411]`。数字段支持 `0 # ? . , %`、尾随逗号缩放、科学计数、数字之间的
//! 字面量、`_x` 留白与 `*x` 填充；含日期记号的段按 1900 序号显示日期时间。
//!
//! 填充字符不能在这里展开：它取决于渲染器的列宽，所以结果只标出填充位置。
mod colors;
mod datetime;
mod fraction;
mod lexer;
mod number;
mod output;
mod pattern;
mod scientific;
mod select;
#[cfg(test)]
mod tests;
#[cfg(test)]
mod fraction_tests;

use lexer::{Section, Token};
use pattern::parse_pattern;
use output::Out;

/// 显示结果：文本、本段颜色（`#rrggbb`）、`*x` 填充位置与 `_x` 留白。
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CustomFormatted {
    pub text: String,
    pub color: Option<String>,
    pub fill: Option<CharMark>,
    /// 每个 `_x` 在 `text` 中是一个空格；渲染器把它换成不可见的 `x`，宽度与 Excel 一致。
    pub pads: Vec<CharMark>,
}

/// `text` 中的字符下标与对应字符。填充：之前的文字贴左，之后的贴右，中间重复 `ch`。
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CharMark {
    pub ch: char,
    pub at: usize,
}

/// 代码无效的类型化原因；对话框按代码映射翻译文案，不在 JS 里再解析一遍。
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CustomFormatError {
    Empty,
    TooLong,
    TooManySections,
    UnclosedQuote,
    UnclosedBracket,
    UnknownBracket,
    IncompleteEscape,
    MultipleDecimalPoints,
    TextWithDigits,
}

impl CustomFormatError {
    pub fn code(self) -> &'static str {
        match self {
            Self::Empty => "empty",
            Self::TooLong => "too-long",
            Self::TooManySections => "too-many-sections",
            Self::UnclosedQuote => "unclosed-quote",
            Self::UnclosedBracket => "unclosed-bracket",
            Self::UnknownBracket => "unknown-bracket",
            Self::IncompleteEscape => "incomplete-escape",
            Self::MultipleDecimalPoints => "multiple-decimal-points",
            Self::TextWithDigits => "text-with-digits",
        }
    }
}

/// 写入前的校验；与显示走同一个解析器，因此能显示的代码一定能通过。
pub fn validate(pattern: &str) -> Result<(), CustomFormatError> {
    parse_pattern(pattern).map(|_| ())
}

/// 数字按段选择、着色与渲染；代码无效或没有可用段时返回 `None`，调用方回退常规显示。
pub fn format_number(pattern: &str, n: f64) -> Option<CustomFormatted> {
    if !n.is_finite() {
        return None;
    }
    let sections = parse_pattern(pattern).ok()?;
    let (section, value) = select::pick_number(&sections, n)?;
    Some(finish(section, number::render(section, value)))
}

/// 文本只在存在文本段（第四段或含 `@` 的段）时改写；否则返回 `None` 原样显示。
pub fn format_text(pattern: &str, text: &str) -> Option<CustomFormatted> {
    let sections = parse_pattern(pattern).ok()?;
    let section = select::pick_text(&sections)?;
    let mut out = Out::default();
    for token in &section.tokens {
        match token {
            Token::Text => out.push_str(text),
            other => out.literal(other),
        }
    }
    Some(finish(section, out))
}

fn finish(section: &Section, out: Out) -> CustomFormatted {
    let (text, fill, pads) = out.into_parts();
    CustomFormatted { text, color: section.color.clone(), fill, pads }
}
