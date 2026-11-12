//! 单段记号化：引号/转义字面量、方括号标签、数字占位、日期时间记号。
use super::colors::color_tag;
use super::CustomFormatError;

#[derive(Clone, Debug, PartialEq)]
pub(super) enum Token {
    Literal(String),
    Fill(char),
    /// `_x`：留出字符 `x` 的宽度。
    Pad(char),
    /// `0`、`#` 或 `?`。
    Digit(char),
    Point,
    Comma,
    Percent,
    /// 未转义的 `/` 才能分隔分子/分母；引号或反斜杠中的 `/` 仍是 Literal。
    Slash,
    Exponent { plus: bool },
    Text,
    General,
    Date(DatePart),
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) enum DatePart {
    Year(usize),
    Month(usize),
    Day(usize),
    Hour(usize),
    Minute(usize),
    Second(usize),
    /// `[h]`/`[mm]`/`[ss]` 累计时长：单位字符与最少位数。
    Elapsed(char, usize),
    SubSecond(usize),
    Meridian(&'static str, &'static str),
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct Condition {
    op: &'static str,
    value: f64,
}

impl Condition {
    fn parse(tag: &str) -> Option<Self> {
        let tag = tag.trim();
        let op = ["<=", ">=", "<>", "<", ">", "="].into_iter().find(|op| tag.starts_with(op))?;
        let value: f64 = tag[op.len()..].trim().parse().ok()?;
        value.is_finite().then_some(Self { op, value })
    }

    pub(super) fn matches(self, n: f64) -> bool {
        match self.op {
            "<=" => n <= self.value,
            ">=" => n >= self.value,
            "<>" => n != self.value,
            "<" => n < self.value,
            ">" => n > self.value,
            _ => n == self.value,
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq)]
pub(super) struct Section {
    pub tokens: Vec<Token>,
    pub color: Option<String>,
    pub condition: Option<Condition>,
}

impl Section {
    pub(super) fn is_date(&self) -> bool {
        self.tokens.iter().any(|token| matches!(token, Token::Date(_)))
    }

    pub(super) fn has(&self, wanted: impl Fn(&Token) -> bool) -> bool {
        self.tokens.iter().any(wanted)
    }
}

impl Token {
    /// 不参与数字/日期计算时，记号按原样字符显示。
    pub(super) fn literal_text(&self) -> String {
        match self {
            Token::Literal(text) => text.clone(),
            Token::Pad(_) => " ".into(),
            Token::Digit(ch) => ch.to_string(),
            Token::Point => ".".into(),
            Token::Comma => ",".into(),
            Token::Percent => "%".into(),
            Token::Slash => "/".into(),
            Token::Exponent { plus } => if *plus { "E+" } else { "E-" }.into(),
            _ => String::new(),
        }
    }
}

const MERIDIANS: [(&str, &str, &str); 5] = [
    ("AM/PM", "AM", "PM"),
    ("am/pm", "am", "pm"),
    ("A/P", "A", "P"),
    ("a/p", "a", "p"),
    ("上午/下午", "上午", "下午"),
];

pub(super) fn tokenize(section: &str) -> Result<Section, CustomFormatError> {
    let chars: Vec<char> = section.chars().collect();
    let mut out = Section::default();
    let mut i = 0;
    while i < chars.len() {
        let ch = chars[i];
        let next = chars.get(i + 1).copied();
        let rest: String = chars[i..].iter().take(7).collect();
        if ch == '"' {
            let end = chars[i + 1..].iter().position(|c| *c == '"')
                .ok_or(CustomFormatError::UnclosedQuote)?;
            out.tokens.push(Token::Literal(chars[i + 1..i + 1 + end].iter().collect()));
            i += end + 2;
            continue;
        }
        if matches!(ch, '\\' | '_' | '*') {
            let next = next.ok_or(CustomFormatError::IncompleteEscape)?;
            out.tokens.push(match ch {
                '\\' => Token::Literal(next.to_string()),
                '_' => Token::Pad(next),
                _ => Token::Fill(next),
            });
            i += 2;
            continue;
        }
        if ch == '[' {
            let end = chars[i + 1..].iter().position(|c| *c == ']')
                .ok_or(CustomFormatError::UnclosedBracket)?;
            let tag: String = chars[i + 1..i + 1 + end].iter().collect();
            bracket(&mut out, &tag)?;
            i += end + 2;
            continue;
        }
        if let Some((text, am, pm)) = MERIDIANS.iter().find(|(text, _, _)| rest.starts_with(text)) {
            out.tokens.push(Token::Date(DatePart::Meridian(am, pm)));
            i += text.chars().count();
            continue;
        }
        if rest.to_ascii_lowercase().starts_with("general") {
            out.tokens.push(Token::General);
            i += 7;
            continue;
        }
        if matches!(ch, 'E' | 'e') && matches!(next, Some('+' | '-')) {
            out.tokens.push(Token::Exponent { plus: next == Some('+') });
            i += 2;
            continue;
        }
        let lower = ch.to_ascii_lowercase();
        if matches!(lower, 'y' | 'm' | 'd' | 'h' | 's') {
            let run = chars[i..].iter().take_while(|c| c.to_ascii_lowercase() == lower).count();
            out.tokens.push(Token::Date(match lower {
                'y' => DatePart::Year(run),
                'm' => DatePart::Month(run),
                'd' => DatePart::Day(run),
                'h' => DatePart::Hour(run),
                _ => DatePart::Second(run),
            }));
            i += run;
            continue;
        }
        out.tokens.push(match ch {
            '0' | '#' | '?' => Token::Digit(ch),
            '.' => Token::Point,
            ',' => Token::Comma,
            '%' => Token::Percent,
            '/' => Token::Slash,
            '@' => Token::Text,
            _ => Token::Literal(ch.to_string()),
        });
        i += 1;
    }
    resolve_minutes(&mut out.tokens);
    resolve_sub_seconds(&mut out.tokens);
    Ok(out)
}

fn bracket(out: &mut Section, tag: &str) -> Result<(), CustomFormatError> {
    if let Some(color) = color_tag(tag) {
        out.color = Some(color.map_err(|_| CustomFormatError::UnknownBracket)?.into());
    } else if let Some(condition) = Condition::parse(tag) {
        out.condition = Some(condition);
    } else if let Some(currency) = tag.strip_prefix('$') {
        // `[$¥-411]` 显示 `¥`；`[$-409]` 只有区域，没有可显示的符号。
        let symbol = currency.split('-').next().unwrap_or_default();
        if !symbol.is_empty() {
            out.tokens.push(Token::Literal(symbol.into()));
        }
    } else if !tag.is_empty() && tag.chars().all(|c| c.eq_ignore_ascii_case(&tag.chars().next().unwrap()))
        && matches!(tag.chars().next().unwrap().to_ascii_lowercase(), 'h' | 'm' | 's')
    {
        let unit = tag.chars().next().unwrap().to_ascii_lowercase();
        out.tokens.push(Token::Date(DatePart::Elapsed(unit, tag.chars().count())));
    } else {
        let lower = tag.to_ascii_lowercase();
        if !(lower.starts_with("dbnum") || lower.starts_with("natnum")) {
            return Err(CustomFormatError::UnknownBracket);
        }
    }
    Ok(())
}

/// Excel 规则：紧跟小时或紧挨秒前的 `m` 是分钟，否则是月份。
fn resolve_minutes(tokens: &mut [Token]) {
    let dates: Vec<(usize, DatePart)> = tokens.iter().enumerate()
        .filter_map(|(index, token)| match token {
            Token::Date(part) => Some((index, *part)),
            _ => None,
        })
        .collect();
    for (position, (index, part)) in dates.iter().enumerate() {
        let DatePart::Month(run) = part else { continue };
        if *run > 2 {
            continue;
        }
        let after_hour = position > 0 && matches!(dates[position - 1].1,
            DatePart::Hour(_) | DatePart::Elapsed('h', _));
        let before_second = matches!(dates.get(position + 1).map(|entry| entry.1),
            Some(DatePart::Second(_) | DatePart::Elapsed('s', _)));
        if after_hour || before_second {
            tokens[*index] = Token::Date(DatePart::Minute(*run));
        }
    }
}

/// `ss.00`：秒后的小数点与 `0` 是小数秒，不是数字占位。
fn resolve_sub_seconds(tokens: &mut Vec<Token>) {
    let mut index = 0;
    while index + 1 < tokens.len() {
        let after_second = index > 0 && matches!(tokens[index - 1],
            Token::Date(DatePart::Second(_) | DatePart::Elapsed('s', _)));
        if after_second && tokens[index] == Token::Point {
            let zeros = tokens[index + 1..].iter().take_while(|t| **t == Token::Digit('0')).count();
            if zeros > 0 {
                tokens.splice(index..index + 1 + zeros, [Token::Date(DatePart::SubSecond(zeros))]);
            }
        }
        index += 1;
    }
}
